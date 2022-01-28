import os
import time
import json
import shutil
import atexit
import subprocess

from watchdog.observers import Observer

from .utils import EarlyStoppingMonitor


class HyperparameterSweep:

    CONFIGURATION_FILE_NAME = "experiment_description.json"
    TEMP_HELP_DIR = "_temp"
    EARLY_STOPPING_LOG_FILE = os.path.join(TEMP_HELP_DIR, "_temp.dat")

    def __init__(self,
                script_name: str,
                hyperparameters: dict,
                max_runs: int,
                logdir: str,
                optimization_metric: str = None,
                optimization_goal: str = "max",
                patience: int = 3):
        """Initializes the module.

        Arguments:
            script_name: Name of the script to run with different hyperparameters
            hyperparameters: Names of different hyperparameters to sample and according samplers
            max_runs: Maximum number of hyperparameter combinations
            logdir: Directory in which log files for different runs are saved
            optimization_metric: Metric used for "Early Stopping" monitoring. If None, no monitoring is performed
            optimization_goal: Criteria used for updating the "Early Stopping" patience counter.
                If @optimization_metric is None this arguments is ignored
            patience: Maximum number of steps during which the @optimization_metric must improve.
                If not, "Early Stopping" event is triggered. If @optimization_metric is None this arguments is ignored
        """
        self._script_name = script_name
        self._hyperparameters = hyperparameters
        self._max_runs = max_runs
        self._optimization_metric = optimization_metric
        self._optimization_goal = optimization_goal
        self._patience = patience

        self._logdir_base = logdir
        # Directory where this particular experiment results will be logged
        self._logdir = os.path.join(self._logdir_base, f"Experiment_{time.strftime('%b-%d_%H-%M-%S')}")
        os.makedirs(self._logdir, exist_ok=True)
        self._base_command_str = f"python {self._script_name} --logdir {self._logdir} "

        self._dump_experiment_configuration()

        if self._optimization_metric:
            # Set-up the "Early Stopping" monitoring
            # This directory will be used only for monitoring
            self.TEMP_HELP_DIR  = os.path.join(self._logdir, self.TEMP_HELP_DIR)
            os.makedirs(self.TEMP_HELP_DIR, exist_ok=True)
            self._early_stopping_log_file_path = os.path.join(self._logdir, self.EARLY_STOPPING_LOG_FILE)
            self._early_stopping = True
            # This file will be monitored for triggering the early stopping event.
            with open(self._early_stopping_log_file_path, "w") as f:
                json.dump(
                    {
                        "metric_name": self._optimization_metric,
                        "curr_value": -1
                    },
                    f
                )
        else:
            self._early_stopping = False
    
        atexit.register(self._clean_up)

    def _dump_experiment_configuration(self):
        """Saves the experiment configuration in a log file.

        This data is used in the frontend application for comparing different hyperparameter sweeps.
        """
        with open(os.path.join(self._logdir, self.CONFIGURATION_FILE_NAME), "w", encoding="utf-8") as f:
            experiment_config = {
                "main_script_name": self._script_name,
                "hyperparameters": {
                    hyp_name: {
                        "hyp_type": hyp_sampler.sampler_type,
                        "hyp_desc": hyp_sampler.get_str_representation()
                    } for hyp_name, hyp_sampler in self._hyperparameters.items()
                },
                "max_runs": self._max_runs,
                "optimization_metric": self._optimization_metric if self._optimization_metric else "/",
                "optimization_goal": self._optimization_goal if self._optimization_metric else "/",
                "sampled_hyperparameters": []
            }
            json.dump(experiment_config, f)

    def run(self):
        """Runs the hyperparameter sweep."""
        if self._early_stopping:
            event_handler = EarlyStoppingMonitor()
            event_handler.MAX_PATIENCE = self._patience
            event_handler.GOAL = self._optimization_goal
            event_handler.PREV_BEST = 1e9 if self._optimization_goal == "min" else -1e9
            event_handler.METRIC_KEY = "curr_value"

            observer = Observer()
            observer.schedule(event_handler, path=self.TEMP_HELP_DIR, recursive=False)
            observer.start()
        try:
            for comb in range(self._max_runs):
                cmd_str, sampled_hyperparameters = self._create_shell_command()
                print("Hyperparameter combination", comb + 1)
                print("Sampled hyperparameters: ", sampled_hyperparameters)
                proc = subprocess.Popen(cmd_str, shell=False)
                event_handler.SUBPROCESS_HANDLE = proc

                # Make sure we memorize the sampled hyperparameter combination in case te training gets interrupted
                self._log_sampled_hyperparameters(sampled_hyperparameters)

                out, err = proc.communicate()
                if proc.poll() is None:
                    proc.terminate()
                print("=" * 75)
                print()
        finally:
            if self._early_stopping:
                observer.stop()
                observer.join()

    def _log_sampled_hyperparameters(self, sampled_hyperparameters):
        """Saves the currently sampled hyperparameters to the experiment config file.

        Arguments:
            sampled_hyperparameters: Hyperparameter names along with their according sampled values        
        """
        with open(os.path.join(self._logdir, self.CONFIGURATION_FILE_NAME), "r+", encoding="utf-8") as f:
            experiment_desc = json.load(f)
            experiment_desc["sampled_hyperparameters"].append(sampled_hyperparameters)
            f.seek(0)
            json.dump(experiment_desc, f)

    def _create_shell_command(self):
        """Creates the shell command which starts the desired main script with sampled hyperparameter values."""
        sampled_hyperparameters = self._sample_hyperparameters()
        # Create command strings for each hyperpameter value
        hyperparam_val_cmds = [f"--{hyp_name} {hyp_val}" for hyp_name, hyp_val in sampled_hyperparameters.items()]
        cmd_str = self._base_command_str + " ".join(hyperparam_val_cmds)
        return cmd_str, sampled_hyperparameters

    def _sample_hyperparameters(self):
        """Samples hyperparameters."""
        sampled_hyperparameters = {
            hyp_name: hyp_sampler.sample() for hyp_name, hyp_sampler in self._hyperparameters.items()
        }
        return sampled_hyperparameters

    def _clean_up(self):
        """Performs clean up after the sweep has/was stopped."""
        try:
            shutil.rmtree(self.TEMP_HELP_DIR)
        except:
            pass
