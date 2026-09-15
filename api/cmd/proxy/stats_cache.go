package main

import (
	"context"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	bucketStatsTTL  = 30 * time.Second
	clusterStatsTTL = 15 * time.Second
)

// cacheState decrit la fraicheur d'une entree de cache.
type cacheState int

const (
	cacheMiss cacheState = iota
	cacheFresh
	cacheStale
)

type cacheEntry[T any] struct {
	value   T
	expires time.Time
}

// cacheLookup est le resultat d'une lecture : State dit si la valeur est
// absente, fraiche ou perimee (Value contient alors la derniere valeur connue).
type cacheLookup[T any] struct {
	Value T
	State cacheState
}

// ttlCache est un cache cle/valeur en memoire avec expiration. Le champ now est
// injectable pour rendre l'expiration testable sans attente reelle. Une entree
// perimee n'est jamais supprimee par une lecture : Lookup peut encore servir la
// derniere valeur connue (stale-while-revalidate).
type ttlCache[T any] struct {
	mu       sync.Mutex
	data     map[string]cacheEntry[T]
	inflight map[string]struct{}
	ttl      time.Duration
	now      func() time.Time
}

func newTTLCache[T any](ttl time.Duration) *ttlCache[T] {
	return &ttlCache[T]{
		data:     map[string]cacheEntry[T]{},
		inflight: map[string]struct{}{},
		ttl:      ttl,
		now:      time.Now,
	}
}

// Get retourne une valeur uniquement si elle est encore fraiche.
func (c *ttlCache[T]) Get(key string) (T, bool) {
	lookup := c.Lookup(key)
	if lookup.State != cacheFresh {
		var zero T
		return zero, false
	}
	return lookup.Value, true
}

// Lookup distingue absence, valeur fraiche et valeur perimee.
func (c *ttlCache[T]) Lookup(key string) cacheLookup[T] {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.data[key]
	if !ok {
		return cacheLookup[T]{State: cacheMiss}
	}
	if c.now().Before(entry.expires) {
		return cacheLookup[T]{Value: entry.value, State: cacheFresh}
	}
	return cacheLookup[T]{Value: entry.value, State: cacheStale}
}

func (c *ttlCache[T]) Set(key string, v T) {
	c.SetTTL(key, v, c.ttl)
}

func (c *ttlCache[T]) SetTTL(key string, v T, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.data[key] = cacheEntry[T]{value: v, expires: c.now().Add(ttl)}
}

func (c *ttlCache[T]) Invalidate(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.data, key)
}

// InvalidatePrefix oublie toutes les cles commencant par prefix. Les cles etant
// composees avec un separateur "|", le prefixe d'un projet ne peut pas capturer
// les cles d'un autre projet.
func (c *ttlCache[T]) InvalidatePrefix(prefix string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for key := range c.data {
		if strings.HasPrefix(key, prefix) {
			delete(c.data, key)
		}
	}
}

func (c *ttlCache[T]) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.data = map[string]cacheEntry[T]{}
	c.inflight = map[string]struct{}{}
}

// RefreshStale rafraichit key en arriere-plan si aucun rafraichissement n'est
// deja en cours (single-flight) : plusieurs appels concurrents ne declenchent
// qu'un seul fetch. La goroutine est detachee du contexte de la requete (qui
// meurt avec la reponse) mais bornee par timeout : elle ne bloque pas la
// reponse et ne fuit pas. Un echec est trace, la valeur precedente reste en
// place et le prochain appel relancera un rafraichissement. Retourne true si un
// rafraichissement a ete lance par cet appel.
func (c *ttlCache[T]) RefreshStale(base context.Context, key string, timeout time.Duration, fetch func(context.Context) (T, error)) bool {
	if !c.beginRefresh(key) {
		return false
	}
	go func() {
		defer c.endRefresh(key)
		ctx, cancel := context.WithTimeout(context.WithoutCancel(base), timeout)
		defer cancel()

		value, err := fetch(ctx)
		if err != nil {
			log.Printf("stats cache: rafraichissement de %q echoue, valeur precedente conservee: %v", key, err)
			return
		}
		c.Set(key, value)
	}()
	return true
}

// beginRefresh reserve le rafraichissement de key : un seul appelant obtient
// true tant que le fetch en cours n'est pas termine.
func (c *ttlCache[T]) beginRefresh(key string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, running := c.inflight[key]; running {
		return false
	}
	c.inflight[key] = struct{}{}
	return true
}

func (c *ttlCache[T]) endRefresh(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.inflight, key)
}

// ------------------------------------------------------------- caches du projet

var (
	bucketStatsCache  = newTTLCache[BucketStatsOverview](bucketStatsTTL)
	clusterStatsCache = newTTLCache[ClusterStats](clusterStatsTTL)
)

// invalidateProjectStatsCache oublie toutes les entrees stats du projet, apres
// une mutation de bucket servie par le proxy. Les mutations qui empruntent le
// proxy admin transparent (alias, quotas) ne sont pas interceptables dans
// handleS3Request : pour ces cas, c'est le stale-while-revalidate qui borne la
// fenetre de peremption a un TTL.
func invalidateProjectStatsCache(projectID uint) {
	prefix := cacheKey(projectID) + "|"
	bucketStatsCache.InvalidatePrefix(prefix)
	clusterStatsCache.InvalidatePrefix(prefix)
}

// statsRequest decrit la lecture cachee d'un endpoint stats. markStale est nil
// pour les endpoints dont le contrat n'expose pas de drapeau "stale" : dans ce
// cas aucune valeur perimee n'est servie (chargement bloquant conserve).
type statsRequest[T any] struct {
	cache      *ttlCache[T]
	key        string
	timeout    time.Duration
	adminReady bool
	markStale  func(T) T
}

// serveStats applique la politique stale-while-revalidate : entree fraiche
// servie telle quelle ; entree perimee servie immediatement avec stale=true et
// rafraichissement unique en tache de fond ; aucune valeur => chargement
// bloquant, dont l'echec remonte en 502.
func serveStats[T any](w http.ResponseWriter, r *http.Request, req statsRequest[T], fetch func(context.Context) (T, error)) {
	lookup := req.cache.Lookup(req.key)
	if lookup.State == cacheFresh {
		writeJSON(w, http.StatusOK, lookup.Value)
		return
	}
	if !req.adminReady {
		jsonError(w, "Admin API not configured for this project", http.StatusBadRequest)
		return
	}
	if lookup.State == cacheStale && req.markStale != nil {
		stale := req.markStale(lookup.Value)
		req.cache.RefreshStale(r.Context(), req.key, req.timeout, fetch)
		writeJSON(w, http.StatusOK, stale)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), req.timeout)
	defer cancel()
	value, err := fetch(ctx)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadGateway)
		return
	}
	req.cache.Set(req.key, value)
	writeJSON(w, http.StatusOK, value)
}
