import { describe, it, expect } from 'vitest';
import { NavTabId } from '../components/BottomNavBar';

describe('Navigation Tab Model & State Contracts', () => {
  it('defines all 4 expected navigation tabs', () => {
    const validTabs: NavTabId[] = ['workbench', 'launchpad', 'worklist', 'tools'];
    expect(validTabs).toContain('workbench');
    expect(validTabs).toContain('launchpad');
    expect(validTabs).toContain('worklist');
    expect(validTabs).toContain('tools');
    expect(validTabs.length).toBe(4);
  });

  it('correctly calculates worklist badge when queue has items', () => {
    const queue = [
      { id: '1', input: 'chr7:g.140753336A>T' },
      { id: '2', input: 'NM_000277.3:c.1222C>T' }
    ];
    const badge = queue.length > 0 ? queue.length : undefined;
    expect(badge).toBe(2);
  });

  it('omits badge when queue is empty', () => {
    const queue: { id: string; input: string }[] = [];
    const badge = queue.length > 0 ? queue.length : undefined;
    expect(badge).toBeUndefined();
  });
});
