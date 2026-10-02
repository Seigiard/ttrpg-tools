/** @jsxImportSource preact */
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { Button } from './button.preact';

describe('Preact Button', () => {
  afterEach(cleanup);

  test('renders a non-submit button by default and forwards clicks', () => {
    // #given a click handler supplied by a generator
    const onClick = mock(() => undefined);
    render(<Button onClick={onClick}>Roll</Button>);

    // #when the user activates the button
    const button = screen.getByRole('button', { name: 'Roll' });
    fireEvent.click(button);

    // #then it is safe outside forms and still dispatches the click
    expect(button.getAttribute('type')).toBe('button');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('keeps variant, size and caller classes on the rendered node', () => {
    // #given styling props used by migrated generators
    render(
      <Button variant="outline" size="icon" className="custom-class">
        x
      </Button>,
    );

    // #when the button renders
    const button = screen.getByRole('button', { name: 'x' });

    // #then the same public class contract remains observable
    expect(button.getAttribute('data-slot')).toBe('button');
    expect(button.className).toContain('border-border');
    expect(button.className).toContain('size-8');
    expect(button.className).toContain('custom-class');
  });
});
