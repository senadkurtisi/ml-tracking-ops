import json
import time
import threading

from watchdog.events import FileSystemEventHandler

from ml_tracking_ops.experiment.sampler import Choice, Uniform


def get_hyperparameter_samplers(hyperparameters: dict):
    """Creates a hyperparameter sampler objects.

    For each hyperparameter defined by the user a sampler object is created.
    Arguments:
        hyperparameters: Definition for each hyperparameter
    """
    hyperparam_samplers = {}
    for hyperparam_name, hyperparam_def in hyperparameters.items():
        if hyperparam_def["type"] in ["choice", "Choice"]:
            hyperparam_samplers[hyperparam_name] = Choice(hyperparam_def["candidates"])
        elif hyperparam_def["type"] in ["uniform", "Uniform"]:
            hyperparam_samplers[hyperparam_name] = Uniform(hyperparam_def["min"], hyperparam_def["max"])
    return hyperparam_samplers


def prepare_event(value, step, init_timestamp):
    """Prepares the metric data in event form suitable for the metric buffer.

    Arguments:
        value: Metric value
        step: Can represent training step, epoch etc.
        init_timestamp: Timestamp when the Experiment Logger was created
    """
    metric_summary = {
        "value": value,
        "step": step,
        "time": time.time() - init_timestamp
    }
    return json.dumps(metric_summary).encode("ascii")


class CallbackTimer:
    """Timer which calls a callback function after timeout with restart possibility."""

    def __init__(self, timeout, callback):
        """Initializes the module.

        Arguments:
            timeout: Number of seconds after which the @callback is called
            callback: Handle for the function to be called after timer timeout
        """
        self.is_on = False
        self._timeout = timeout
        self._callback = callback
        self._timer = threading.Timer(self._timeout, self._callback)

    def start(self):
        """Starts the timer."""
        self._timer.start()
        self.is_on = True

    def reset(self):
        """Resets the timer state."""
        self._timer = threading.Timer(self._timeout, self._callback)
        self.is_on = False

    def cancel(self):
        """Cancels the timer."""
        self.is_on = False
        if self._timer.is_alive:
            self._timer.cancel()


class EarlyStoppingMonitor(FileSystemEventHandler):
    """Watchdog for the early stopping log file.

    Terminates the started training process after specified metric hasn't improved.
    """

    SUBPROCESS_HANDLE = None
    MAX_PATIENCE = None
    PATIENCE_CNT = 0
    GOAL = None
    METRIC_KEY = None
    PREV_BEST = None

    def on_modified(self, event):
        """Runs when specified log file was updated."""
        with open(event.src_path, "r") as f:
            log_data = json.load(f)

        if self.GOAL == "max":
            self.PATIENCE_CNT = self.PATIENCE_CNT + 1  if log_data[self.METRIC_KEY] <= self.PREV_BEST else 0
            self.PREV_BEST = max(self.PREV_BEST, log_data[self.METRIC_KEY])
        elif self.GOAL == "min":
            self.PATIENCE_CNT = self.PATIENCE_CNT + 1  if log_data[self.METRIC_KEY] >= self.PREV_BEST else 0
            self.PREV_BEST = min(self.PREV_BEST, log_data[self.METRIC_KEY])

        # Specified metric hasn't improved for the @MAX_PATIENCE steps
        if self.PATIENCE_CNT == self.MAX_PATIENCE:
            # Notify the user that the training process was stopped due to "Early Stopping"
            print(f"Early stopping. Best value of {self.PREV_BEST} was achieved for metric: {log_data['metric_name']}")
            self.SUBPROCESS_HANDLE.kill()
            self._reset()

    def _reset(self):
        """Resets the Early stopping monitor.

        Usage: Preparing the monitor for the next hyperparameter combination.
        """
        self.SUBPROCESS_HANDLE = None
        self.PATIENCE_CNT = 0
        self.PREV_BEST = 1e9 if self.GOAL == "min" else -1e9
