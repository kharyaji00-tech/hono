/** @jsxImportSource ../../jsx */
import { Hono } from '../../'
import { isValidElement } from '../../jsx'
import type { JSXNode } from '../../jsx'
import { Suspense, renderToReadableStream } from '../../jsx/streaming'
import type { HtmlEscapedString } from '../../utils/html'
import { HtmlEscapedCallbackPhase, resolveCallback } from '../../utils/html'
import { Style, css, cx, keyframes } from './index'

async function toString(
  template: JSXNode | Promise<HtmlEscapedString> | Promise<string> | HtmlEscapedString
) {
  if (template instanceof Promise) {
    template = (await template) as HtmlEscapedString
  }
  if (isValidElement(template)) {
    template = template.toString() as Promise<HtmlEscapedString>
  }
  return resolveCallback(await template, HtmlEscapedCallbackPhase.Stringify, false, template)
}

describe('awaiting css()/cx() must not drop generated CSS rules', () => {
  // Awaiting `css()`/`cx()` resolves to a `String` object marked `isEscaped`
  // whose `callbacks` register the rule with the context. The synchronous
  // stringify path previously dropped those callbacks, so the generated class
  // name rendered while the `<style id>` rule was silently lost. These cases
  // guard the awaited prop, child, cx, keyframes, app, streaming, and
  // non-awaited regression paths.

  it('awaited css() as a JSX prop injects the rule into <style id="hono-css">', async () => {
    const cls = await css`
      background-color: blue;
    `
    const template = (
      <>
        <Style />
        <h1 class={cls}>Hello!</h1>
      </>
    )
    expect(await toString(template)).toBe(
      '<style id="hono-css">.css-2458908649{background-color:blue}</style><h1 class="css-2458908649">Hello!</h1>'
    )
  })

  it('awaited css() as a JSX child injects the rule', async () => {
    const cls = await css`
      background-color: blue;
    `
    const template = (
      <>
        <Style />
        {cls}
      </>
    )
    expect(await toString(template)).toBe(
      '<style id="hono-css">.css-2458908649{background-color:blue}</style>css-2458908649'
    )
  })

  it('awaited cx() as a JSX prop injects the rule and keeps the external class', async () => {
    const btn = css`
      border-radius: 4px;
    `
    const combined = await cx(btn, 'external-class')
    const template = (
      <>
        <Style />
        <h1 class={combined}>Hello!</h1>
      </>
    )
    expect(await toString(template)).toBe(
      '<style id="hono-css">.css-3467431616{border-radius:4px}</style><h1 class="css-3467431616 external-class">Hello!</h1>'
    )
  })

  it('awaited css() composes keyframes and injects the @keyframes block', async () => {
    const animation = keyframes`
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    `
    const cls = await css`
      background-color: blue;
      animation: ${animation} 1s ease-in-out;
    `
    const template = (
      <>
        <Style />
        <h1 class={cls}>Hello!</h1>
      </>
    )
    expect(await toString(template)).toBe(
      '<style id="hono-css">.css-1580801783{background-color:blue;animation:css-9294673 1s ease-in-out}@keyframes css-9294673{from{opacity:0}to{opacity:1}}</style><h1 class="css-1580801783">Hello!</h1>'
    )
  })

  it('awaited css() through a Hono app injects the rule for a sync route', async () => {
    const app = new Hono()
    app.get('/', async (c) => {
      const cls = await css`
        background-color: blue;
      `
      return c.html(
        <>
          <Style />
          <h1 class={cls}>Hello!</h1>
        </>
      )
    })
    const res = await app.request('http://localhost/')
    expect(res).not.toBeNull()
    expect(await res.text()).toBe(
      '<style id="hono-css">.css-2458908649{background-color:blue}</style><h1 class="css-2458908649">Hello!</h1>'
    )
  })

  it('awaited css() in a delayed async component under Suspense injects the rule via the append script', async () => {
    let resolveAsync!: () => void
    const slow = new Promise<void>((done) => (resolveAsync = done))
    const cls = await css`
      background-color: blue;
    `
    const Async = async () => {
      await slow
      return <h1 class={cls}>Hello!</h1>
    }
    const reader = renderToReadableStream(
      <>
        <Style />
        <Suspense fallback={<p>Loading...</p>}>
          <Async />
        </Suspense>
      </>
    ).getReader()

    const first = new TextDecoder().decode((await reader.read()).value)
    expect(first).toContain('<style id="hono-css"></style>')
    expect(first).toContain('<p>Loading...</p>')
    expect(first).not.toContain('.css-2458908649{background-color:blue}')

    resolveAsync()

    let rest = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      rest += new TextDecoder().decode(value)
    }
    expect(rest).toContain('.css-2458908649{background-color:blue}')
    expect(rest).toContain('<h1 class="css-2458908649">Hello!</h1>')
  })

  it('non-awaited css() as a JSX prop still injects the rule (regression)', async () => {
    const headerClass = css`
      background-color: blue;
    `
    const template = (
      <>
        <Style />
        <h1 class={headerClass}>Hello!</h1>
      </>
    )
    expect(await toString(template)).toBe(
      '<style id="hono-css">.css-2458908649{background-color:blue}</style><h1 class="css-2458908649">Hello!</h1>'
    )
  })
})
