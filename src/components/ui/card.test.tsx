import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/preact';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';

describe('Preact Card', () => {
  afterEach(cleanup);

  test('renders every named slot for generator layouts', () => {
    // #given the full card composition used by result panels
    render(
      <Card size="sm" className="outer">
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
          <CardAction>Action</CardAction>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );

    // #when consumers query the rendered card structure
    const card = screen.getByText('Title').closest('[data-slot="card"]');

    // #then slots and size flags match the React primitive contract
    expect(card?.getAttribute('data-size')).toBe('sm');
    expect(card?.className).toContain('outer');
    expect(screen.getByText('Title').getAttribute('data-slot')).toBe('card-title');
    expect(screen.getByText('Description').getAttribute('data-slot')).toBe('card-description');
    expect(screen.getByText('Action').getAttribute('data-slot')).toBe('card-action');
    expect(screen.getByText('Content').getAttribute('data-slot')).toBe('card-content');
    expect(screen.getByText('Footer').getAttribute('data-slot')).toBe('card-footer');
  });
});
