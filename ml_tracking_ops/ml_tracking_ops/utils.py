import json
import pickle
import base64


def get_all_metrics(experiment_logs_data):
    """Retrieves names of all metrics present in the given group of experiment logs."""
    metrics = []
    for log_data in experiment_logs_data:
        metrics += list(log_data.keys())
    return list(set(metrics))


def decode_experiment_log(binarized_series):
    """Performs binary decoding of the time-series data given."""
    loaded_bytes = base64.b64decode(binarized_series)
    decoded_series_bytes = pickle.loads(loaded_bytes)
    decoded_series_json = [json.loads(elem_bytes) for elem_bytes in decoded_series_bytes]
    return decoded_series_json


def load_and_decode_experiment_log(log_file_path: str):
    """Opens and decodes bynary encoding of the log data stored in the specified path."""
    with open(log_file_path, "r") as f:
        log_data = json.load(f)
        decoded_logs = {
            metric_name: decode_experiment_log(value_series) for metric_name, value_series in log_data.items()
        }
    return decoded_logs
