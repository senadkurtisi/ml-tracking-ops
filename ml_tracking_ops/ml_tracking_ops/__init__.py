
from flask import Flask

app = Flask(__name__)

from ml_tracking_ops.ml_tracking_ops import routes
