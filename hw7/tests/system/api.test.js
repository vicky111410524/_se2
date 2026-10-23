import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';

describe('System Test: Web API Endpoints', () => {
  it('GET /api/todos 應回傳 HTTP 200 與陣列', async () => {
    const res = await request(app).get('/api/todos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/todos 應成功創建 Todo 並回傳 201', async () => {
    const res = await request(app)
      .post('/api/todos')
      .send({ title: '通過系統測試', dueDate: '2026-12-31T18:30' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('通過系統測試');
    expect(res.body.dueDate).toBe('2026-12-31T18:30');
  });

  it('POST /api/todos 未提供截止時間時應回傳 dueDate = null', async () => {
    const res = await request(app)
      .post('/api/todos')
      .send({ title: '沒有截止時間的任務' });

    expect(res.status).toBe(201);
    expect(res.body.dueDate).toBeNull();
  });

  it('POST /api/todos 當輸入不符合規則時應回傳 400 錯誤', async () => {
    const res = await request(app)
      .post('/api/todos')
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/todos 當截止時間格式錯誤時應回傳 400 錯誤', async () => {
    const res = await request(app)
      .post('/api/todos')
      .send({ title: '時間錯誤的任務', dueDate: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('截止時間格式不正確');
  });
});
