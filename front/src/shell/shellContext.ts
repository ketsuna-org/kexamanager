import { createContext } from "react"

export interface ShellContextValue {
    openNav: () => void
}

/** Lets a page's top bar open the mobile navigation drawer owned by the shell. */
export const ShellContext = createContext<ShellContextValue>({ openNav: () => undefined })
