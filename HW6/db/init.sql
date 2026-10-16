-- HW6 PostgreSQL 初始化腳本（僅在資料卷第一次建立時執行）
CREATE TABLE IF NOT EXISTS messages (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(40)  NOT NULL DEFAULT 'anonymous',
    content    VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO messages (name, content) VALUES
    ('system', 'Welcome to the HW6 Docker microservice system.'),
    ('docker', 'nginx -> node-api -> postgres is up and running.');
