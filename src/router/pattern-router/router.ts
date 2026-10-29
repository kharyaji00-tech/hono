import type { Params, Result, Router } from '../../router'
import { METHOD_NAME_ALL, UnsupportedPathError } from '../../router'

type Route<T> = [RegExp, string, T] // [pattern, method, handler]

const emptyParams = Object.create(null)

export class PatternRouter<T> implements Router<T> {
  name: string = 'PatternRouter'
  #routes: Route<T>[] = []

  add(method: string, path: string, handler: T) {
    // A trailing param label glued to `*` (e.g. `/files/:filepath*` or
    // `/:id*`) is the path-to-regexp "rest of path" idiom (zero or more
    // segments). Without special handling it falls into the bare-`*` suffix
    // branch and compiles to an unanchored `^/files/(?<filepath>[^/]+)`, which
    // prefix-matches deeper paths (`/files/a/b`) with a truncated param
    // (`filepath: "a"`) and silently shadows more specific routes registered
    // later. Rewrite it to the equivalent optional multi-segment param
    // `:label{.+}?` so the existing optional-param handling below compiles it
    // with the full remaining path captured into `label` and a proper
    // end-anchor.
    const rest = path.match(/\/:(\w+)\*$/)
    if (rest) {
      path = `${path.slice(0, -rest[0].length)}/:${rest[1]}{.+}?`
    }
    const suffix = path.endsWith('/*') ? '(?:$|/)' : path.endsWith('*') ? '' : '/?$'
    path = path.replace(/\*$/, '')
    if (path.at(-1) === '?') {
      path = path.slice(0, -1)
      this.add(method, path.replace(/\/[^/]+$/, ''), handler)
    }

    const parts = (path.match(/\/?(:\w+(?:{(?:(?:{[\d,]+})|[^}])+})?)|\/?[^\/\?]+/g) || []).map(
      (part) => {
        const match = part.match(/^\/:([^{]+)(?:{(.*)})?/)
        return match
          ? `/(?<${match[1]}>${match[2] || '[^/]+'})`
          : part === '/*'
            ? '/[^/]+'
            : part.replace(/[.\\+*[^\]$()]/g, '\\$&')
      }
    )

    try {
      this.#routes.push([new RegExp(`^${parts.join('')}${suffix}`), method, handler])
    } catch {
      throw new UnsupportedPathError()
    }
  }

  match(method: string, path: string): Result<T> {
    const handlers: [T, Params][] = []

    for (let i = 0, len = this.#routes.length; i < len; i++) {
      const [pattern, routeMethod, handler] = this.#routes[i]

      if (routeMethod === method || routeMethod === METHOD_NAME_ALL) {
        const match = pattern.exec(path)
        if (match) {
          handlers.push([handler, match.groups || emptyParams])
        }
      }
    }

    return [handlers]
  }
}
