import os
import json
from argparse import ArgumentParser

from ml_tracking_ops.ml_tracking_ops import app
from ml_tracking_ops.experiment.experiment_tracking import HyperparameterSweep
from ml_tracking_ops.experiment.utils import get_hyperparameter_samplers


def collect_arguments():
    default_logdir = "runs"
    parser = ArgumentParser()
    parser.add_argument("--run_sweep", type=bool, default=False,
        help="\nTrue: Starting the hyperparameter search experiment. \nFalse: Start the experiment visualization tool."
    )
    parser.add_argument("--logdir", type=str, default=default_logdir)
    cfg = parser.parse_args()
    return cfg


def run_experiment(cfg):
    try:
        experiment_cfg_path = os.path.join(os.getcwd(), "experiment_cfg.json")
        with open(experiment_cfg_path, "r") as f:
            experiment_cfg = json.load(f)
    except:
        raise Exception("Module experiment_config does not contain a hyperparameter sweep definition.")

    # Extract the hyperparameter sweep description
    main_script = experiment_cfg["main_script_name"]
    hyperparameters = experiment_cfg["hyperparameters"]
    hyperparameter_samplers = get_hyperparameter_samplers(hyperparameters)

    sweep = HyperparameterSweep(
        script_name=main_script,
        hyperparameters=hyperparameter_samplers,
        max_runs=experiment_cfg["max_runs"],
        logdir=cfg.logdir,
        optimization_metric=experiment_cfg["optimization_metric"] if experiment_cfg["early_stopping"] else None,
        optimization_goal=experiment_cfg["optimization_goal"] if experiment_cfg["early_stopping"] else None,
        patience= experiment_cfg["early_stopping_patience"] if experiment_cfg["early_stopping"] else None
    )
    sweep.run()


def main():
    cfg = collect_arguments()
    if cfg.run_sweep:
        run_experiment(cfg)
    else:
        app.config["logdir"] = cfg.logdir
        app.run(debug=False)
