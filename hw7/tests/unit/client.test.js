import { describe, it, expect } from 'vitest';
import {
  formatTodoTitle,
  isValidTitle,
  isValidDueDate,
  formatDueDateTime,
  formatDateLabel,
  formatTimeLabel,
  getDueStatus,
  groupTodosByDate
} from '../../public/clientUtils.js';

describe('Client Unit Test: Utils', () => {
  it('formatTodoTitle 應轉換字串為大寫並去除首尾空格', () => {
    expect(formatTodoTitle('  hello  ')).toBe('HELLO');
  });

  it('isValidTitle 應拒絕小於 2 個字的字串', () => {
    expect(isValidTitle('a')).toBe(false);
    expect(isValidTitle('ab')).toBe(true);
  });

  it('isValidDueDate 應允許空值並拒絕無效格式', () => {
    expect(isValidDueDate('')).toBe(true);
    expect(isValidDueDate('2026-12-31T18:30')).toBe(true);
    expect(isValidDueDate('not-a-date')).toBe(false);
  });

  it('formatDueDateTime 應輸出在地化的日期時間', () => {
    expect(formatDueDateTime('2026-10-25T14:30')).toBe('2026/10/25 14:30');
    expect(formatDueDateTime('')).toBe('未設定');
  });

  it('formatDateLabel 與 formatTimeLabel 應輸出表格用文字', () => {
    expect(formatDateLabel('2026-10-25T14:30')).toBe('10/25（週日）');
    expect(formatTimeLabel('2026-10-25T14:30')).toBe('14:30');
    expect(formatTimeLabel('')).toBe('—');
  });

  it('getDueStatus 應分辨逾期、今天與未到期', () => {
    const now = new Date('2026-10-25T10:00');
    expect(getDueStatus('2026-10-25T09:00', now).key).toBe('overdue');
    expect(getDueStatus('2026-10-25T14:30', now).key).toBe('today');
    expect(getDueStatus('2026-10-26T09:00', now).key).toBe('upcoming');
    expect(getDueStatus('', now).key).toBe('none');
  });

  it('groupTodosByDate 應依日期分組、統計逾期並將未設定排在最後', () => {
    const todos = [
      { id: 1, dueDate: '2026-10-26T09:00' },
      { id: 2, dueDate: '2026-10-25T09:00' },
      { id: 3, dueDate: '2026-10-25T18:00' },
      { id: 4, dueDate: null }
    ];
    const now = new Date('2026-10-25T10:00');

    const groups = groupTodosByDate(todos, now);

    expect(groups).toHaveLength(3);
    expect(groups[0].key).toBe('2026-10-25');
    expect(groups[0].total).toBe(2);
    expect(groups[0].overdue).toBe(1);
    expect(groups[0].earliest.getHours()).toBe(9);
    expect(groups[0].status.tone).toBe('danger');
    expect(groups[2].key).toBe('none');
  });
});
