import json
import os
from flask import render_template, url_for, redirect

from ml_tracking_ops.ml_tracking_ops import app
from ml_tracking_ops.ml_tracking_ops.utils import get_all_metrics, load_and_decode_experiment_log


loaded_data = {}
SWEEP_CONFIG_FILENAME = "experiment_description.json"


@app.route("/")
@app.route("/home")
def home():
    experiment_dirs = os.listdir(app.config["logdir"])
    loaded_data["sweep_dirs"] = []
    loaded_data["experiment_dirs"] = []
    for dir_name in experiment_dirs:
        sweep_configuration_file_path = os.path.join(app.config["logdir"], dir_name, SWEEP_CONFIG_FILENAME)
        if os.path.exists(sweep_configuration_file_path):
            loaded_data["sweep_dirs"].append(dir_name)
        else:
            loaded_data["experiment_dirs"].append(dir_name)

    return redirect(url_for("experiments"))


@app.route("/get_experiment_data/<experiment_id>")
def get_experiment_data(experiment_id):
    experiment_data = loaded_data["experiment_logs"][experiment_id]
    return json.dumps(experiment_data)


@app.route("/experiments")
def experiments():
    experiment_dirs = loaded_data["experiment_dirs"]
    experiment_dirs_abs = [os.path.join(app.config["logdir"], dirname) for dirname in experiment_dirs]

    # Register filenames for log files for each experiment run
    experiment_filedata = {}
    for experiment_dir_rel, experiment_dir_abs in zip(experiment_dirs, experiment_dirs_abs):
        experiment_files = [fname for fname in os.listdir(experiment_dir_abs) if fname.endswith(".dat")]
        if experiment_files:
            experiment_filedata[experiment_dir_rel] = os.path.join(experiment_dir_abs, experiment_files[0])

    # Load log files for each experiment
    experiment_logs_data = {
        log_file_dir: load_and_decode_experiment_log(log_file_path)
            for log_file_dir, log_file_path in experiment_filedata.items()
    }
    all_metrics = get_all_metrics(experiment_logs_data.values())
    loaded_data["experiment_logs"] = experiment_logs_data
    loaded_data["all_metrics"] = all_metrics
    experiment_ids = list(experiment_logs_data.keys())

    return render_template("experiments.html", experiment_ids=experiment_ids, all_metrics=all_metrics)


@app.route("/get_sweep_data/<sweep_id>")
def get_sweep_data(sweep_id):
    sweep_data = loaded_data["sweep_logs"][sweep_id]
    return json.dumps(sweep_data)


@app.route("/sweeps")
def sweeps():
    sweep_dirs = loaded_data["sweep_dirs"]
    
    sweep_logs = {}
    for sweep_dir in sweep_dirs:
        sweep_dir_abs = os.path.join(app.config["logdir"], sweep_dir)
        sweep_log_files = os.listdir(sweep_dir_abs)

        # Decode sweep configuration
        with open(os.path.join(sweep_dir_abs, SWEEP_CONFIG_FILENAME), "r") as f:
            sweep_config = json.load(f)

        sweep_desc = {
            "sweep_config": sweep_config,
            "experiment_data": [load_and_decode_experiment_log(os.path.join(sweep_dir_abs, log_file_path))
                for log_file_path in sweep_log_files if log_file_path != SWEEP_CONFIG_FILENAME]
        }
        sweep_logs[sweep_dir] = sweep_desc

    all_metrics = []
    for sweep in sweep_logs.values():
        all_metrics += get_all_metrics(sweep["experiment_data"])
    all_metrics = list(set(all_metrics))
    
    loaded_data["sweep_logs"] = sweep_logs        
    return render_template("sweeps.html", sweep_dirs=sweep_dirs, all_metrics=all_metrics)
