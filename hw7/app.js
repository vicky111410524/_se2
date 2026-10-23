import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  ].join('T');
}

function createSeedDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(18, 0, 0, 0);
  return formatLocalDateTime(date);
}

let todos = [
  {
    id: 1,
    title: '學習單元測試',
    completed: false,
    dueDate: createSeedDueDate()
  }
];

export function isValidDueDate(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return false;
  return !Number.isNaN(new Date(value).getTime());
}

export function validateTodoPayload(payload) {
  if (!payload || typeof payload.title !== 'string' || payload.title.trim() === '') {
    return { valid: false, message: '標題不能為空' };
  }
  if (!isValidDueDate(payload.dueDate)) {
    return { valid: false, message: '截止時間格式不正確' };
  }
  return { valid: true };
}

app.get('/api/todos', (req, res) => {
  res.json(todos);
});

app.post('/api/todos', (req, res) => {
  const validation = validateTodoPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  const dueDate = typeof req.body.dueDate === 'string' && req.body.dueDate.trim() !== ''
    ? req.body.dueDate.trim()
    : null;

  const newTodo = {
    id: Date.now(),
    title: req.body.title.trim(),
    completed: false,
    dueDate
  };
  todos.push(newTodo);
  res.status(201).json(newTodo);
});

app.delete('/api/todos/:id', (req, res) => {
  const id = Number(req.params.id);
  todos = todos.filter(t => t.id !== id);
  res.status(200).json({ success: true });
});
