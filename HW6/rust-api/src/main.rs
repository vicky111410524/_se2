use axum::{
    extract::Query,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;

#[derive(Serialize)]
struct Health {
    service: &'static str,
    status: &'static str,
    runtime: &'static str,
}

async fn health() -> Json<Health> {
    Json(Health {
        service: "rust-api",
        status: "ok",
        runtime: "rust / axum",
    })
}

async fn fib(Query(params): Query<HashMap<String, String>>) -> Json<Value> {
    let n: u64 = params
        .get("n")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20);

    if n > 90 {
        return Json(json!({ "error": "n must be <= 90" }));
    }

    let (mut a, mut b): (u128, u128) = (0, 1);
    for _ in 0..n {
        let next = a + b;
        a = b;
        b = next;
    }

    Json(json!({ "n": n, "result": a }))
}

async fn index() -> Json<Value> {
    Json(json!({
        "service": "rust-api",
        "endpoints": ["/health", "/fib?n=20"]
    }))
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(index))
        .route("/health", get(health))
        .route("/fib", get(fib));

    let addr = SocketAddr::from(([0, 0, 0, 0], 8002));
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind :8002");
    println!("rust-api listening on {addr}");
    axum::serve(listener, app).await.expect("server error");
}
