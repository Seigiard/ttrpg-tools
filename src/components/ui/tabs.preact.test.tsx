/** @jsxImportSource preact */
import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.preact';

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
    render(<StatefulTabs />);

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
    render(<StatefulTabs />);
    const spring = screen.getByRole('tab', { name: 'Весна' });
    const winter = screen.getByRole('tab', { name: 'Зима' });
    spring.focus();

    // #when the user presses the horizontal next key
    fireEvent.keyDown(spring, { key: 'ArrowRight' });

    // #then focus moves, while activation remains explicit
    expect(document.activeElement).toBe(winter);
    expect(winter.getAttribute('aria-selected')).toBe('false');
  });
});
