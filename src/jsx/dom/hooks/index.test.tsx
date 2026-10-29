/** @jsxImportSource ../../ */
import { JSDOM } from 'jsdom'
import { registerAction, useActionState, useFormStatus, useOptimistic } from '.'
import { render, useCallback, useState } from '..'

describe('Hooks', () => {
  beforeAll(() => {
    global.requestAnimationFrame = (cb) => setTimeout(cb)
  })

  const unhandledRejections: unknown[] = []
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason)
  }
  beforeAll(() => {
    process.on('unhandledRejection', onUnhandledRejection)
  })
  afterAll(() => {
    process.off('unhandledRejection', onUnhandledRejection)
  })

  let dom: JSDOM
  let root: HTMLElement
  beforeEach(() => {
    unhandledRejections.length = 0
    dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
      runScripts: 'dangerously',
    })
    global.document = dom.window.document
    global.HTMLElement = dom.window.HTMLElement
    global.SVGElement = dom.window.SVGElement
    global.Text = dom.window.Text
    global.FormData = dom.window.FormData
    root = document.getElementById('root') as HTMLElement
  })

  describe('registerAction', () => {
    it('should not produce an unhandled rejection when the action rejects', async () => {
      registerAction(Promise.reject(new Error('boom')))
      // Give the rejection a chance to surface as an unhandledRejection if it
      // were going to (a macrotask after the rejection microtasks drain).
      await new Promise((resolve) => setTimeout(resolve, 10))
      await Promise.resolve()
      expect(unhandledRejections).toEqual([])
    })
  })

  describe('useActionState', () => {
    it('should return initial state', () => {
      const [state] = useActionState(() => {}, 'initial')
      expect(state).toBe('initial')
    })

    it('should return updated state', async () => {
      const action = vi.fn().mockReturnValue('updated')

      const App = () => {
        const [state, formAction] = useActionState(action, 'initial')
        return (
          <>
            <div>{state}</div>
            <form action={formAction}>
              <input type='text' name='name' value='updated' />
              <button>Submit</button>
            </form>
          </>
        )
      }

      render(<App />, root)
      expect(root.innerHTML).toBe(
        '<div>initial</div><form><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )
      root.querySelector('button')?.click()
      await Promise.resolve()
      await Promise.resolve()
      expect(root.innerHTML).toBe(
        '<div>updated</div><form><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )

      expect(action).toHaveBeenCalledOnce()
      const [initialState, formData] = action.mock.calls[0]
      expect(initialState).toBe('initial')
      expect(formData).toBeInstanceOf(FormData)
      expect(formData.get('name')).toBe('updated')
    })
  })

  describe('useFormStatus', () => {
    it('should return initial state', () => {
      const status = useFormStatus()
      expect(status).toEqual({
        pending: false,
        data: null,
        method: null,
        action: null,
      })
    })

    it('should return updated state', async () => {
      let formResolve: () => void = () => {}
      const formPromise = new Promise<void>((r) => (formResolve = r))
      let status: ReturnType<typeof useFormStatus> | undefined
      const Status = () => {
        status = useFormStatus()
        return null
      }
      const App = () => {
        const [, setCount] = useState(0)
        const action = useCallback(() => {
          setCount((count) => count + 1)
          return formPromise
        }, [])
        return (
          <>
            <form action={action}>
              <Status />
              <input type='text' name='name' value='updated' />
              <button>Submit</button>
            </form>
          </>
        )
      }

      render(<App />, root)
      expect(root.innerHTML).toBe(
        '<form><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )
      root.querySelector('button')?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(status).toEqual({
        pending: true,
        data: expect.any(FormData),
        method: 'post',
        action: expect.any(Function),
      })
      formResolve?.()
      await Promise.resolve()
      await Promise.resolve()
      expect(status).toEqual({
        pending: false,
        data: null,
        method: null,
        action: null,
      })
    })

    it('should reset pending state to false when the action rejects', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      let formReject: (e: unknown) => void = () => {}
      const formPromise = new Promise<void>((_, rej) => (formReject = rej))
      let status: ReturnType<typeof useFormStatus> | undefined
      const Status = () => {
        status = useFormStatus()
        return null
      }
      const App = () => {
        const action = useCallback(() => formPromise, [])
        return (
          <>
            <form action={action}>
              <Status />
              <input type='text' name='name' value='updated' />
              <button>Submit</button>
            </form>
          </>
        )
      }

      render(<App />, root)
      root.querySelector('button')?.click()
      // pending becomes true while the action is in flight
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(status).toEqual({
        pending: true,
        data: expect.any(FormData),
        method: 'post',
        action: expect.any(Function),
      })

      // after the rejection is handled, pending MUST reset to false
      formReject(new Error('action failed!'))
      await new Promise((resolve) => setTimeout(resolve, 10))
      await Promise.resolve()
      await Promise.resolve()
      expect(status).toEqual({
        pending: false,
        data: null,
        method: null,
        action: null,
      })
      // the rejection is surfaced (mirrors error-boundary intent) rather than dropped
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error))
      expect(unhandledRejections).toEqual([])
      consoleErrorSpy.mockRestore()
    })

    it('should remain usable after a failed action (a later resolving action resets pending)', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      let status: ReturnType<typeof useFormStatus> | undefined
      const Status = () => {
        status = useFormStatus()
        return null
      }
      let formResolve: () => void = () => {}
      const formPromise = new Promise<void>((r) => (formResolve = r))
      let callCount = 0
      const App = () => {
        const action = useCallback(() => {
          callCount++
          return callCount === 1 ? Promise.reject(new Error('first fails')) : formPromise
        }, [])
        return (
          <>
            <form action={action}>
              <Status />
              <input type='text' name='name' value='updated' />
              <button>Submit</button>
            </form>
          </>
        )
      }

      render(<App />, root)
      // first submit: rejects
      root.querySelector('button')?.click()
      await new Promise((resolve) => setTimeout(resolve, 10))
      await Promise.resolve()
      await Promise.resolve()
      expect(status).toMatchObject({ pending: false })

      // second submit: resolves — the form must not be wedged in pending
      root.querySelector('button')?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(status).toMatchObject({ pending: true })
      formResolve()
      await new Promise((resolve) => setTimeout(resolve, 10))
      await Promise.resolve()
      await Promise.resolve()
      expect(status).toMatchObject({ pending: false })
      expect(unhandledRejections).toEqual([])
      consoleErrorSpy.mockRestore()
    })
  })

  describe('useOptimistic', () => {
    it('should return updated state', async () => {
      let formResolve: () => void = () => {}
      const formPromise = new Promise<void>((r) => (formResolve = r))
      const App = () => {
        const [count, setCount] = useState(0)
        const [optimisticCount, setOptimisticCount] = useOptimistic(count, (_c, n: number) => n)
        const action = useCallback(async () => {
          setOptimisticCount(count + 1)
          await formPromise
          setCount((count) => count + 2)
        }, [])

        return (
          <>
            <form action={action}>
              <div>{optimisticCount}</div>
              <input type='text' name='name' value='updated' />
              <button>Submit</button>
            </form>
          </>
        )
      }

      render(<App />, root)
      expect(root.innerHTML).toBe(
        '<form><div>0</div><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )
      root.querySelector('button')?.click()
      await Promise.resolve()
      expect(root.innerHTML).toBe(
        '<form><div>1</div><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )
      formResolve?.()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(root.innerHTML).toBe(
        '<form><div>2</div><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )
    })

    it('should revert optimistic state when the action rejects', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const App = () => {
        const [count] = useState(0)
        const [optimisticCount, setOptimisticCount] = useOptimistic(count, (_c, n: number) => n)
        const action = useCallback(async () => {
          setOptimisticCount(1)
          await Promise.reject(new Error('action failed!'))
        }, [])
        return (
          <>
            <form action={action}>
              <div>{optimisticCount}</div>
              <input type='text' name='name' value='updated' />
              <button>Submit</button>
            </form>
          </>
        )
      }

      render(<App />, root)
      expect(root.innerHTML).toBe(
        '<form><div>0</div><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )
      root.querySelector('button')?.click()
      await Promise.resolve()
      // optimistic state is applied immediately
      expect(root.innerHTML).toBe(
        '<form><div>1</div><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )
      // after the rejection, optimistic state rolls back to the original value
      await new Promise((resolve) => setTimeout(resolve, 10))
      await Promise.resolve()
      await Promise.resolve()
      expect(root.innerHTML).toBe(
        '<form><div>0</div><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error))
      expect(unhandledRejections).toEqual([])
      consoleErrorSpy.mockRestore()
    })

    it('should wait for all actions to settle before reverting (not revert on first rejection)', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      let rejectP1: (e: unknown) => void = () => {}
      let resolveP2: () => void = () => {}
      const p1 = new Promise<void>((_, rej) => (rejectP1 = rej))
      const p2 = new Promise<void>((res) => (resolveP2 = res))
      let callIndex = 0
      const promises = [p1, p2]

      const App = () => {
        const [optimisticCount, setOptimisticCount] = useOptimistic(0, (_c, n: number) => n)
        const action = useCallback(() => {
          setOptimisticCount(1)
          return promises[callIndex++]
        }, [])
        return (
          <>
            <form action={action}>
              <div>{optimisticCount}</div>
              <input type='text' name='name' value='updated' />
              <button>Submit</button>
            </form>
          </>
        )
      }

      render(<App />, root)
      expect(root.innerHTML).toBe(
        '<form><div>0</div><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )
      // submit twice synchronously so both actions are registered before any
      // re-render snapshots the pending-action set (a single render then sees
      // both actions and schedules one Promise.allSettled for them).
      root.querySelector('button')?.click()
      root.querySelector('button')?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(root.innerHTML).toBe(
        '<form><div>1</div><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )

      // the first action rejects, but the second is still pending: optimistic
      // state must NOT roll back yet (Promise.allSettled waits for both).
      rejectP1(new Error('first fails'))
      await new Promise((resolve) => setTimeout(resolve, 10))
      await Promise.resolve()
      await Promise.resolve()
      expect(root.innerHTML).toBe(
        '<form><div>1</div><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )
      expect(unhandledRejections).toEqual([])

      // now the second action resolves — all settled -> revert to original
      resolveP2()
      await new Promise((resolve) => setTimeout(resolve, 10))
      await Promise.resolve()
      await Promise.resolve()
      expect(root.innerHTML).toBe(
        '<form><div>0</div><input type="text" name="name" value="updated"><button>Submit</button></form>'
      )
      expect(unhandledRejections).toEqual([])
      consoleErrorSpy.mockRestore()
    })
  })
})
