/** @jsxImportSource ./ */

import type { HtmlEscapedString } from '../utils/html'
import type { Child, FC, JSXNode } from './base'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cloneElement, jsx, Fragment } from './base'

describe('cloneElement', () => {
  it('should clone an element with new props', () => {
    const element = <div className='original'>Hello</div>
    const clonedElement = cloneElement(element, { className: 'cloned' })
    expect((clonedElement as unknown as JSXNode).props.className).toBe('cloned')
    expect((clonedElement as unknown as JSXNode).props.children).toBe('Hello')
  })

  it('should clone a children element', () => {
    const fnElement = ({ message }: { message: string }) => <div>{message}</div>
    const element = fnElement({ message: 'Hello' })
    const clonedElement = cloneElement(element, {})
    expect(element.toString()).toBe('<div>Hello</div>')
    expect(clonedElement.toString()).toBe('<div>Hello</div>')
  })

  it('should clone an element with new children', () => {
    const fnElement = ({ message }: { message: string }) => <div>{message}</div>
    const element = fnElement({ message: 'Hello' })
    const clonedElement = cloneElement(element, {}, 'World')
    expect(element.toString()).toBe('<div>Hello</div>')
    expect(clonedElement.toString()).toBe('<div>World</div>')
  })

  it('should self-close a wrapped empty tag', () => {
    const Hr = ({ ...props }) => <hr {...props} />
    const element = <Hr />
    expect(element.toString()).toBe('<hr/>')
  })

  it('should preserve self-closing empty tag when cloned', () => {
    const element = <img src='foo.png' />
    const clonedElement = cloneElement(element, { alt: 'bar' })
    expect(element.toString()).toBe('<img src="foo.png"/>')
    expect(clonedElement.toString()).toBe('<img src="foo.png" alt="bar"/>')
  })

  it('should clone an element with array children', () => {
    const element = (
      <div>
        <span>1</span>
        <span>2</span>
      </div>
    )
    const clonedElement = cloneElement(element, { className: 'cloned' })
    expect(clonedElement.toString()).toBe('<div class="cloned"><span>1</span><span>2</span></div>')
  })
})

describe('createElement', () => {
  it('should accept a component that returns a JSXNode', () => {
    const Partial = ({ name }: { name: string }) => jsx('div', { 'x-partial': name }, name)

    expect((<Partial name='foo' />).toString()).toBe('<div x-partial="foo">foo</div>')
  })

  it('should preserve the SVG element shape', () => {
    const ref = { current: null }
    const element = jsx('svg', { ref }) as unknown as JSXNode
    expect(element.tag).toBe('svg')
    expect(element.type).toBe('svg')
    expect(element.ref).toBe(ref)
  })

  it('should accept a Child-typed value as a child', () => {
    const child: Child = <span>inner</span>
    const element = jsx('div', null, child) as unknown as JSXNode
    expect(element.toString()).toBe('<div><span>inner</span></div>')
  })

  it('should escape a string returned by an asynchronous component', async () => {
    const Async = async () => '<img src=x onerror=alert(1)>' as unknown as HtmlEscapedString

    expect(
      String(
        await (
          <div>
            <Async />
          </div>
        ).toString()
      )
    ).toBe('<div>&lt;img src=x onerror=alert(1)&gt;</div>')
  })

  it.each([null, undefined, true, false])(
    'should render nothing for an asynchronous component returning %s',
    async (item) => {
      const Async = (async () => item) as unknown as FC
      const template = (
        <div>
          <Async />
        </div>
      )
      expect(String(await template.toString())).toBe('<div></div>')
    }
  )

  it.each([0, 5])(
    'should stringify a number returned by an asynchronous component (%s)',
    async (item) => {
      const Async = (async () => item) as unknown as FC
      const template = (
        <div>
          <Async />
        </div>
      )
      expect(String(await template.toString())).toBe(`<div>${item}</div>`)
    }
  )

  it('should render nothing for a top-level asynchronous component returning null', async () => {
    const Async = (async () => null) as unknown as FC
    expect(String(await (<Async />).toString())).toBe('')
  })

  it.each([null, undefined, true, false])(
    'should render nothing for a direct Promise child resolving to %s',
    async (item) => {
      const template = <div>{Promise.resolve(item) as never}</div>
      expect(String(await template.toString())).toBe('<div></div>')
    }
  )

  it.each([0, 5])(
    'should stringify a direct Promise child resolving to a number (%s)',
    async (item) => {
      const template = <div>{Promise.resolve(item) as never}</div>
      expect(String(await template.toString())).toBe(`<div>${item}</div>`)
    }
  )

  it('should omit an unsupported object child', () => {
    const object = { toString: () => 'plain-text' }

    expect((<div>{object as never}</div>).toString()).toBe('<div></div>')
  })
})
