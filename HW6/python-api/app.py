import os
import platform
import socket

from flask import Flask, jsonify, request

app = Flask(__name__)
HOSTNAME = socket.gethostname()


@app.get("/health")
def health():
    return jsonify(
        service="python-api",
        status="ok",
        runtime=f"python {platform.python_version()}",
        host=HOSTNAME,
    )


@app.get("/info")
def info():
    return jsonify(
        service="python-api",
        python=platform.python_version(),
        implementation=platform.python_implementation(),
        platform=platform.platform(),
        host=HOSTNAME,
        cwd=os.getcwd(),
    )


@app.get("/fib")
def fib():
    try:
        n = int(request.args.get("n", "10"))
    except ValueError:
        return jsonify(error="n must be an integer"), 400
    if n < 0 or n > 90:
        return jsonify(error="n must be between 0 and 90"), 400
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return jsonify(n=n, result=a)


@app.get("/")
def index():
    return jsonify(service="python-api", endpoints=["/health", "/info", "/fib?n=10"])


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
