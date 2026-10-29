/** @jsxImportSource ../ */
import { JSDOM } from 'jsdom'
import { ErrorBoundary as ErrorBoundaryDom, Suspense as SuspenseDom, render } from '.' // for dom
import { ErrorBoundary as ErrorBoundaryCommon, Suspense as SuspenseCommon } from '..' // for common
// run tests by old style jsx default
// hono/jsx/jsx-runtime and hono/jsx/dom/jsx-runtime are tested in their respective settings
import { use, useState } from '../hooks'

runner('Common', SuspenseCommon, ErrorBoundaryCommon)
runner('DOM', SuspenseDom, ErrorBoundaryDom)

function runner(
  name: string,
  Suspense: typeof SuspenseDom,
  ErrorBoundary: typeof ErrorBoundaryDom
) {
  describe(name, () => {
    beforeAll(() => {
      global.requestAnimationFrame = (cb) => setTimeout(cb)
    })

    describe('Suspense', () => {
      let dom: JSDOM
      let root: HTMLElement
      beforeEach(() => {
        dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
          runScripts: 'dangerously',
        })
        global.document = dom.window.document
        global.HTMLElement = dom.window.HTMLElement
        global.Text = dom.window.Text
        root = document.getElementById('root') as HTMLElement
      })

      it('has no lazy load content', async () => {
        const App = <Suspense fallback={<div>Loading...</div>}>Hello</Suspense>
        render(App, root)
        expect(root.innerHTML).toBe('Hello')
      })

      it('with use()', async () => {
        let resolve: (value: number) => void = () => {}
        const promise = new Promise<number>((_resolve) => (resolve = _resolve))
        const Content = () => {
          const num = use(promise)
          return <p>{num}</p>
        }
        const Component = () => {
          return (
            <Suspense fallback={<div>Loading...</div>}>
              <Content />
            </Suspense>
          )
        }
        const App = <Component />
        render(App, root)
        expect(root.innerHTML).toBe('<div>Loading...</div>')
        resolve(1)
        await new Promise((resolve) => setTimeout(resolve))
        expect(root.innerHTML).toBe('<p>1</p>')
      })

      it('with use() update', async () => {
        const counterMap: Record<number, Promise<number>> = {}
        const getCounter = (count: number) => (counterMap[count] ||= Promise.resolve(count + 1))
        const Content = ({ count }: { count: number }) => {
          const num = use(getCounter(count))
          return (
            <>
              <div>{num}</div>
            </>
          )
        }
        const Component = () => {
          const [count, setCount] = useState(0)
          return (
            <Suspense fallback={<div>Loading...</div>}>
              <Content count={count} />
              <button onClick={() => setCount(count + 1)}>Increment</button>
            </Suspense>
          )
        }
        const App = <Component />
        render(App, root)
        expect(root.innerHTML).toBe('<div>Loading...</div>')
        await Promise.resolve()
        await Promise.resolve()
        expect(root.innerHTML).toBe('<div>1</div><button>Increment</button>')
        root.querySelector('button')?.click()
        await Promise.resolve()
        expect(root.innerHTML).toBe('<div>Loading...</div>')
        await Promise.resolve()
        await Promise.resolve()
        expect(root.innerHTML).toBe('<div>2</div><button>Increment</button>')
      })

      it('with use() nested', async () => {
        let resolve: (value: number) => void = () => {}
        const promise = new Promise<number>((_resolve) => (resolve = _resolve))
        const Content = () => {
          const num = use(promise)
          return <p>{num}</p>
        }
        let resolve2: (value: number) => void = () => {}
        const promise2 = new Promise<number>((_resolve) => (resolve2 = _resolve))
        const Content2 = () => {
          const num = use(promise2)
          return <p>{num}</p>
        }
        const Component = () => {
          return (
            <Suspense fallback={<div>Loading...</div>}>
              <Content />
              <Suspense fallback={<div>More...</div>}>
                <Content2 />
              </Suspense>
            </Suspense>
          )
        }
        const App = <Component />
        render(App, root)
        expect(root.innerHTML).toBe('<div>Loading...</div>')
        resolve(1)
        await new Promise((resolve) => setTimeout(resolve))
        expect(root.innerHTML).toBe('<p>1</p><div>More...</div>')
        resolve2(2)
        await new Promise((resolve) => setTimeout(resolve))
        expect(root.innerHTML).toBe('<p>1</p><p>2</p>')
      })

      it('race condition', async () => {
        let resolve: (value: number) => void = () => {}
        const promise = new Promise<number>((_resolve) => (resolve = _resolve))
        const Content = () => {
          const num = use(promise)
          return <p>{num}</p>
        }
        const Component = () => {
          const [show, setShow] = useState(false)
          return (
            <div>
              <button onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
              {show && (
                <Suspense fallback={<div>Loading...</div>}>
                  <Content />
                </Suspense>
              )}
            </div>
          )
        }
        const App = <Component />
        render(App, root)
        expect(root.innerHTML).toBe('<div><button>Show</button></div>')
        root.querySelector('button')?.click()
        await Promise.resolve()
        expect(root.innerHTML).toBe('<div><button>Hide</button><div>Loading...</div></div>')
        root.querySelector('button')?.click()
        await Promise.resolve()
        expect(root.innerHTML).toBe('<div><button>Show</button></div>')
        root.querySelector('button')?.click()
        await Promise.resolve()
        expect(root.innerHTML).toBe('<div><button>Hide</button><div>Loading...</div></div>')
        resolve(2)
        await Promise.resolve()
        await Promise.resolve()
        expect(root.innerHTML).toBe('<div><button>Hide</button><p>2</p></div>')
      })

      it('Suspense at child', async () => {
        let resolve: (value: number) => void = () => {}
        const promise = new Promise<number>((_resolve) => (resolve = _resolve))
        const Content = () => {
          const num = use(promise)
          return <p>{num}</p>
        }

        const Component = () => {
          return (
            <Suspense fallback={<div>Loading...</div>}>
              <Content />
            </Suspense>
          )
        }
        const App = () => {
          const [show, setShow] = useState(false)
          return (
            <div>
              {show && <Component />}
              <button onClick={() => setShow(true)}>Show</button>
            </div>
          )
        }
        render(<App />, root)
        expect(root.innerHTML).toBe('<div><button>Show</button></div>')
        root.querySelector('button')?.click()
        await Promise.resolve()
        expect(root.innerHTML).toBe('<div><div>Loading...</div><button>Show</button></div>')
        resolve(2)
        await Promise.resolve()
        await Promise.resolve()
        expect(root.innerHTML).toBe('<div><p>2</p><button>Show</button></div>')
      })

      it('Suspense at child counter', async () => {
        const promiseMap: Record<number, Promise<number>> = {}
        const Counter = () => {
          const [count, setCount] = useState(0)
          const promise = (promiseMap[count] ||= Promise.resolve(count))
          const value = use(promise)
          return (
            <>
              <p>{value}</p>
              <button onClick={() => setCount(count + 1)}>Increment</button>
            </>
          )
        }
        const Component = () => {
          return (
            <Suspense fallback={<div>Loading...</div>}>
              <Counter />
            </Suspense>
          )
        }
        const App = () => {
          return (
            <div>
              <Component />
            </div>
          )
        }
        render(<App />, root)
        expect(root.innerHTML).toBe('<div><div>Loading...</div></div>')
        await Promise.resolve()
        await Promise.resolve()
        expect(root.innerHTML).toBe('<div><p>0</p><button>Increment</button></div>')
        root.querySelector('button')?.click()
        await Promise.resolve()
        expect(root.innerHTML).toBe('<div><div>Loading...</div></div>')
        await Promise.resolve()
        await Promise.resolve()
        expect(root.innerHTML).toBe('<div><p>1</p><button>Increment</button></div>')
      })
    })

    describe('ErrorBoundary', () => {
      let dom: JSDOM
      let root: HTMLElement
      beforeEach(() => {
        dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
          runScripts: 'dangerously',
        })
        global.document = dom.window.document
        global.HTMLElement = dom.window.HTMLElement
        global.Text = dom.window.Text
        root = document.getElementById('root') as HTMLElement
      })

      it('has no error', async () => {
        const App = (
          <ErrorBoundary fallback={<div>Error</div>}>
            <div>OK</div>
          </ErrorBoundary>
        )
        render(App, root)
        expect(root.innerHTML).toBe('<div>OK</div>')
      })

      it('has error', async () => {
        const Component = () => {
          throw new Error('error')
        }
        const App = (
          <ErrorBoundary fallback={<div>Error</div>}>
            <Component />
          </ErrorBoundary>
        )
        render(App, root)
        expect(root.innerHTML).toBe('<div>Error</div>')
      })

      it('has no error with Suspense', async () => {
        let resolve: (value: number) => void = () => {}
        const promise = new Promise<number>((_resolve) => (resolve = _resolve))
        const Content = () => {
          const num = use(promise)
          return <p>{num}</p>
        }
        const Component = () => {
          return (
            <ErrorBoundary fallback={<div>Error</div>}>
              <Suspense fallback={<div>Loading...</div>}>
                <Content />
              </Suspense>
            </ErrorBoundary>
          )
        }
        const App = <Component />
        render(App, root)
        expect(root.innerHTML).toBe('<div>Loading...</div>')
        resolve(1)
        await new Promise((resolve) => setTimeout(resolve))
        expect(root.innerHTML).toBe('<p>1</p>')
      })

      it('has error with Suspense', async () => {
        let resolve: (value: number) => void = () => {}
        const promise = new Promise<number>((_resolve) => (resolve = _resolve))
        const Content = () => {
          use(promise)
          throw new Error('error')
        }
        const Component = () => {
          return (
            <ErrorBoundary fallback={<div>Error</div>}>
              <Suspense fallback={<div>Loading...</div>}>
                <Content />
              </Suspense>
            </ErrorBoundary>
          )
        }
        const App = <Component />
        render(App, root)
        expect(root.innerHTML).toBe('<div>Loading...</div>')
        resolve(1)
        await new Promise((resolve) => setTimeout(resolve))
        expect(root.innerHTML).toBe('<div>Error</div>')
      })

      it('catches an error thrown during an update and recovers without a stale fallback', async () => {
        const unhandled: unknown[] = []
        const onRejection = (e: unknown) => unhandled.push(e)
        process.on('unhandledRejection', onRejection)
        try {
          const Thrower = () => {
            throw new Error('boom')
          }
          const Ok = ({ n }: { n: number }) => <div>OK-{n}</div>
          const App = () => {
            const [n, setN] = useState(0)
            return (
              <div>
                <button onClick={() => setN(n + 1)}>next</button>
                <ErrorBoundary fallback={<div>Error</div>}>
                  {n === 1 ? <Thrower /> : <Ok n={n} />}
                </ErrorBoundary>
              </div>
            )
          }
          render(<App />, root)
          expect(root.innerHTML).toBe('<div><button>next</button><div>OK-0</div></div>')

          // Flip the working subtree into a throwing one via state update.
          root.querySelector('button')?.click()
          await new Promise((resolve) => setTimeout(resolve))
          expect(root.innerHTML).toBe('<div><button>next</button><div>Error</div></div>')
          // The aborted subtree must not surface as an unhandled rejection
          // (the pre-fix code crashed with `TypeError ... 'forEach'` in getNextChildren).
          expect(unhandled).toHaveLength(0)

          // Recover: the fallback element installed by the error path must be removed.
          root.querySelector('button')?.click()
          await new Promise((resolve) => setTimeout(resolve))
          expect(root.innerHTML).toBe('<div><button>next</button><div>OK-2</div></div>')
          expect(unhandled).toHaveLength(0)
        } finally {
          process.off('unhandledRejection', onRejection)
        }
      })

      it('replaces the whole failed subtree with the fallback on an update error', async () => {
        const unhandled: unknown[] = []
        const onRejection = (e: unknown) => unhandled.push(e)
        process.on('unhandledRejection', onRejection)
        try {
          const Deep = ({ n }: { n: number }) => {
            if (n === 1) {
              throw new Error('boom')
            }
            return <div>deep-{n}</div>
          }
          const App = () => {
            const [n, setN] = useState(0)
            return (
              <main>
                <button onClick={() => setN(n + 1)}>go</button>
                <ErrorBoundary fallback={<div>ERROR-FALLBACK</div>}>
                  <section>
                    <Deep n={n} />
                  </section>
                </ErrorBoundary>
              </main>
            )
          }
          render(<App />, root)
          expect(root.innerHTML).toBe(
            '<main><button>go</button><section><div>deep-0</div></section></main>'
          )

          // The failed <section> subtree is replaced by the fallback; no stale
          // content is resurrected next to the fallback, and no rejection occurs.
          root.querySelector('button')?.click()
          await new Promise((resolve) => setTimeout(resolve))
          expect(root.innerHTML).toBe('<main><button>go</button><div>ERROR-FALLBACK</div></main>')
          expect(unhandled).toHaveLength(0)

          // Recover: the <section> subtree comes back and the fallback is gone.
          root.querySelector('button')?.click()
          await new Promise((resolve) => setTimeout(resolve))
          expect(root.innerHTML).toBe(
            '<main><button>go</button><section><div>deep-2</div></section></main>'
          )
          expect(unhandled).toHaveLength(0)
        } finally {
          process.off('unhandledRejection', onRejection)
        }
      })

      it('survives repeated error/recovery cycles without stuck DOM', async () => {
        const unhandled: unknown[] = []
        const onRejection = (e: unknown) => unhandled.push(e)
        process.on('unhandledRejection', onRejection)
        try {
          const Thrower = () => {
            throw new Error('boom')
          }
          const Ok = ({ n }: { n: number }) => <span>ok-{n}</span>
          const App = () => {
            const [n, setN] = useState(0)
            return (
              <div>
                <button onClick={() => setN(n + 1)}>step</button>
                <ErrorBoundary fallback={<b>err</b>}>
                  {n % 2 === 1 ? <Thrower /> : <Ok n={n} />}
                </ErrorBoundary>
              </div>
            )
          }
          render(<App />, root)
          const expected: Record<number, string> = {
            0: '<div><button>step</button><span>ok-0</span></div>',
            1: '<div><button>step</button><b>err</b></div>',
            2: '<div><button>step</button><span>ok-2</span></div>',
            3: '<div><button>step</button><b>err</b></div>',
            4: '<div><button>step</button><span>ok-4</span></div>',
          }
          expect(root.innerHTML).toBe(expected[0])
          for (let i = 1; i <= 4; i++) {
            root.querySelector('button')?.click()
            await new Promise((resolve) => setTimeout(resolve))
            expect(root.innerHTML).toBe(expected[i])
          }
          expect(unhandled).toHaveLength(0)
        } finally {
          process.off('unhandledRejection', onRejection)
        }
      })

      it('invokes onError for an error thrown during an update', async () => {
        const unhandled: unknown[] = []
        const onRejection = (e: unknown) => unhandled.push(e)
        process.on('unhandledRejection', onRejection)
        try {
          const onError = vi.fn()
          const Thrower = () => {
            throw new Error('boom')
          }
          const App = () => {
            const [n, setN] = useState(0)
            return (
              <div>
                <button onClick={() => setN(n + 1)}>next</button>
                <ErrorBoundary fallback={<div>Error</div>} onError={onError}>
                  {n === 1 ? <Thrower /> : <div>OK-{n}</div>}
                </ErrorBoundary>
              </div>
            )
          }
          render(<App />, root)
          expect(onError).not.toHaveBeenCalled()

          root.querySelector('button')?.click()
          await new Promise((resolve) => setTimeout(resolve))
          expect(root.innerHTML).toBe('<div><button>next</button><div>Error</div></div>')
          expect(onError).toHaveBeenCalledTimes(1)
          expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
          expect(unhandled).toHaveLength(0)
        } finally {
          process.off('unhandledRejection', onRejection)
        }
      })
    })
  })
}
