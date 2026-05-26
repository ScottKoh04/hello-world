import json
import os
from flask import Flask, render_template, jsonify

app = Flask(__name__)

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "courses.json")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/courses")
def courses():
    with open(DATA_PATH) as f:
        return jsonify(json.load(f))

if __name__ == "__main__":
    app.run(debug=True)
