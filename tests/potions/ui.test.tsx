// @vitest-environment jsdom
import { act as reactAct } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PotionsGame from '@/components/potions/PotionsGame';
import { axeViolations, click, mount, press } from '../helpers/dom';

let view: Awaited<ReturnType<typeof mount>> | undefined;
const button = (label: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes(label));
beforeEach(() => { localStorage.clear(); Object.defineProperty(document, 'hidden', { configurable: true, value: false }); });
afterEach(() => { view?.unmount(); view = undefined; vi.useRealTimers(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('Potion table UI', () => {
  it('has an accessible labelled lobby and bilingual rules', async () => {
    view = await mount(<PotionsGame />);
    expect(document.querySelectorAll('select')).toHaveLength(3);
    expect(await axeViolations(view.container)).toEqual([]);
    await click(button('How to play')); expect(document.querySelector('.p-rules')?.textContent).toContain('multiple of 10');
    expect(await axeViolations(view.container)).toEqual([]);
  });
  it('uses the shared Russian setting', async () => {
    localStorage.setItem('lab:lang', 'ru'); view = await mount(<PotionsGame />);
    expect(document.querySelector('h1')?.textContent).toContain('Переполох');
    await click(button('Войти в лабораторию'));
    expect(document.querySelector('.p-controls')?.textContent).toContain('Открыть карту');
  });
  it('reveals with keyboard, pauses bots for rules, pause and hidden tabs', async () => {
    vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(.5);
    view = await mount(<PotionsGame />); await click(button('Enter the laboratory'));
    await press(window, ' ', { code: 'Space' });
    expect(document.querySelectorAll('.p-table .p-card')).toHaveLength(1);
    await click(button('How to play'));
    await reactAct(async () => { vi.advanceTimersByTime(10000); });
    await click(button('Back to the table'));
    expect(document.querySelectorAll('.p-table .p-card')).toHaveLength(1);
    await reactAct(async () => { vi.advanceTimersByTime(1400); });
    expect(document.querySelectorAll('.p-table .p-card')).toHaveLength(2);
    await click(button('Pause'));
    await reactAct(async () => { vi.advanceTimersByTime(10000); });
    expect(document.querySelector('.p-paused')).not.toBeNull();
    await click(button('Resume'));
    expect(document.querySelectorAll('.p-table .p-card')).toHaveLength(2);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await reactAct(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(document.querySelector('.p-paused')).not.toBeNull();
  });
  it('can brew, pass, settle and start the next round through real controls', async () => {
    vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(.5);
    view = await mount(<PotionsGame />); await click(button('Enter the laboratory'));
    for (let n = 0; n < 100 && !button('Done grabbing'); n++) {
      const reveal = button('Reveal a card'); if (reveal && !reveal.disabled) await click(reveal);
      await reactAct(async () => { vi.advanceTimersByTime(2000); });
    }
    expect(button('Done grabbing')).toBeDefined();
    const takeable = document.querySelector<HTMLButtonElement>('.p-table button:not(:disabled)');
    if (takeable) await click(takeable);
    await click(button('Done grabbing'));
    for (let n = 0; n < 100 && !button('Bank ingredients'); n++) await reactAct(async () => { vi.advanceTimersByTime(1500); });
    expect(button('Bank ingredients')).toBeDefined();
    expect(document.querySelector('.p-preview')).not.toBeNull();
    await click(button('Bank ingredients'));
    expect(document.querySelector('.p-round-results')).not.toBeNull();
    await click(button('Next round'));
    expect(document.querySelector('.p-table-top')?.textContent).toContain('Brew 2');
  });
});
