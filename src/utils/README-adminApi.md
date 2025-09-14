# Utilitaire API Admin

Ce module fournit des fonctions utilitaires pour effectuer des appels HTTP vers l'API Admin de Kexamanager.

## Configuration

L'API utilise la configuration de proxy définie dans `vite.config.ts` qui redirige `/api/admin/*` vers `VITE_API_ADMIN_URL`.

## Fonctions disponibles

### Méthodes HTTP

- `adminGet<T>(endpoint, params?)` - Requête GET
- `adminPost<T>(endpoint, data?)` - Requête POST
- `adminPut<T>(endpoint, data?)` - Requête PUT
- `adminPatch<T>(endpoint, data?)` - Requête PATCH
- `adminDelete<T>(endpoint)` - Requête DELETE

### Gestion de l'authentification

- `setAuthToken(token)` - Définir le token d'authentification
- `clearAuthToken()` - Supprimer le token
- `isAuthenticated()` - Vérifier si l'utilisateur est authentifié

## Exemples d'utilisation

### Requête GET simple
```typescript
import { adminGet } from '@/utils/adminApi'

// Récupérer tous les buckets
const buckets = await adminGet<Bucket[]>('/buckets')

// Avec paramètres de query
const users = await adminGet<User[]>('/users', {
  page: '1',
  limit: '10'
})
```

### Requête POST avec données
```typescript
import { adminPost } from '@/utils/adminApi'

const newBucket = await adminPost<Bucket>('/buckets', {
  BucketArn: 'arn:aws:s3:::my-bucket',
  BucketRegion: 'eu-west-1',
  Name: 'Mon Bucket'
})
```

### Gestion des erreurs
```typescript
import { adminGet } from '@/utils/adminApi'
import type { ApiError } from '@/utils/adminApi'

try {
  const data = await adminGet('/protected-endpoint')
} catch (error) {
  const apiError = error as ApiError

  if (apiError.status === 401) {
    // Token expiré ou invalide
    clearAuthToken()
    // Rediriger vers la page de connexion
  }

  console.error('Erreur API:', apiError.message)
}
```

### Hook personnalisé
```typescript
import { useState, useEffect } from 'react'
import { adminGet, adminPost } from '@/utils/adminApi'
import type { ApiError } from '@/utils/adminApi'

function useApiData<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminGet<T>(endpoint)
      .then(setData)
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false))
  }, [endpoint])

  return { data, loading, error }
}
```

## Types

### ApiResponse<T>
Interface générique pour les réponses API :
```typescript
interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}
```

### ApiError
Interface pour les erreurs API :
```typescript
interface ApiError {
  message: string
  status: number
  code?: string
}
```

## Authentification

Les fonctions utilisent automatiquement le token stocké dans `localStorage` sous la clé `kexamanager:token`.

Pour configurer l'authentification :
```typescript
import { setAuthToken } from '@/utils/adminApi'

// Après connexion réussie
setAuthToken('your-jwt-token')

// Pour déconnexion
clearAuthToken()
```

## Gestion automatique des headers

Les fonctions ajoutent automatiquement :
- `Content-Type: application/json`
- `Authorization: Bearer ${token}` (si un token est présent)

## Intégration avec les composants

Voir `src/examples/bucketsApiExample.ts` pour un exemple complet d'intégration dans un composant React avec hook personnalisé.
