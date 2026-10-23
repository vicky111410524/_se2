import { describe, it, expect } from 'vitest';
import { isValidDueDate, validateTodoPayload } from '../../app.js';

describe('Server Unit Test: validateTodoPayload', () => {
  it('當標題為空時應回傳 valid = false', () => {
    expect(validateTodoPayload({ title: '   ' }).valid).toBe(false);
  });

  it('當標題合法時應回傳 valid = true', () => {
    expect(validateTodoPayload({ title: '撰寫測試' }).valid).toBe(true);
  });

  it('未提供截止時間時應視為合法', () => {
    expect(validateTodoPayload({ title: '撰寫測試' }).valid).toBe(true);
    expect(validateTodoPayload({ title: '撰寫測試', dueDate: '' }).valid).toBe(true);
  });

  it('截止時間格式錯誤時應回傳 valid = false 與錯誤訊息', () => {
    const result = validateTodoPayload({ title: '撰寫測試', dueDate: '不是時間' });
    expect(result.valid).toBe(false);
    expect(result.message).toBe('截止時間格式不正確');
  });
});

describe('Server Unit Test: isValidDueDate', () => {
  it('應接受合法的日期時間字串', () => {
    expect(isValidDueDate('2026-12-31T18:30')).toBe(true);
  });

  it('應拒絕非字串或無效日期', () => {
    expect(isValidDueDate(123456)).toBe(false);
    expect(isValidDueDate('2026-13-40T99:99')).toBe(false);
  });
});
