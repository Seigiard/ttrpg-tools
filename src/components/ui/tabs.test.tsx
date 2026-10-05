import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

function StatefulTabs() {
  const [value, setValue] = useState('spring');

  return (
    <Tabs value={value} onValueChange={(next) => setValue(String(next))}>
      <TabsList>
        <TabsTrigger value="spring">Весна</TabsTrigger>
        <TabsTrigger value="winter">Зима</TabsTrigger>
      </TabsList>
      <TabsContent value="spring">Spring panel</TabsContent>
      <TabsContent value="winter">Winter panel</TabsContent>
    </Tabs>
  );
}

describe('Preact Tabs', () => {
  afterEach(cleanup);

  test('clicking a tab changes selection and visible panel', () => {
    // #given controlled tabs with one selected value
    // Queries stay inside this render: CI runs test files concurrently on one document.
    const { container } = render(<StatefulTabs />);

    if (!(container instanceof HTMLElement)) throw new Error('Expected an HTML container');
    const screen = within(container);

    // #when the user selects another tab
    fireEvent.click(screen.getByRole('tab', { name: 'Зима' }));

    // #then aria/data state and panel visibility move together
    expect(screen.getByRole('tab', { name: 'Зима' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Зима' }).hasAttribute('data-active')).toBe(true);
    expect(screen.getByText('Winter panel').hasAttribute('hidden')).toBe(false);
    expect(screen.getByText('Spring panel').hasAttribute('hidden')).toBe(true);
  });

  test('arrow keys move focus between tab triggers without selecting', () => {
    // #given horizontal tabs where keyboard users move through triggers
    // Queries stay inside this render: CI runs test files concurrently on one document.
    const { container } = render(<StatefulTabs />);

    if (!(container instanceof HTMLElement)) throw new Error('Expected an HTML container');
    const screen = within(container);
    const spring = screen.getByRole('tab', { name: 'Весна' });
    const winter = screen.getByRole('tab', { name: 'Зима' });
    spring.focus();

    // #when the user presses the horizontal next key
    fireEvent.keyDown(spring, { key: 'ArrowRight' });

    // #then focus and the next Tab entry point move, while activation remains explicit
    expect({
      active: document.activeElement,
      winterSelected: winter.getAttribute('aria-selected'),
      springTabIndex: spring.getAttribute('tabindex'),
      winterTabIndex: winter.getAttribute('tabindex'),
    }).toEqual({
      active: winter,
      winterSelected: 'false',
      springTabIndex: '-1',
      winterTabIndex: '0',
    });
  });
});
