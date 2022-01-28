import os
import time
import json
import pickle
import base64
import atexit

from typing import Union

from .utils import prepare_event
from .utils import CallbackTimer


class MetricBuffer:
    """Queue which buffers logs for the specified metric after reaching maximum capacity.

    Motivation: Evading the I/O bottleneck of constant writing to a log file.
    """

    def __init__(self, metric_name: str, buffer_capacity: int, db_path: str):
        """Initializes the module.

        Arguments:
            metric_name: Metric for which we buffer the values
            buffer_capacity: Number of elements in the buffer after which we dump
                buffer content into a log file
            db_path: Location of the log file to which we dump buffer content
        """
        self._db_path = db_path
        self._metric_name = metric_name
        self._buffer_capacity = buffer_capacity
        self._buffer_size = 0
        self._buffer = []

    def add_event(self, metric_summary: dict):
        """Adds event to the buffer."""
        self._buffer.append(metric_summary)
        self._buffer_size += 1
        if self._buffer_size == self._buffer_capacity:
            self.dump()

    def dump(self):
        """Writes events from the buffer to a binary file."""
        if self._buffer_size == 0:
            return
        with open(self._db_path, "r+") as f:
            db = json.load(f)
            if self._metric_name not in db:
                # We are loggin this metric's value for the first time
                db[self._metric_name] = []
            else:
                loaded_bytes = base64.b64decode(db[self._metric_name])
                db[self._metric_name] = pickle.loads(loaded_bytes)

            db[self._metric_name] += self._buffer
            db[self._metric_name] = pickle.dumps(db[self._metric_name])
            db[self._metric_name] = base64.b64encode(db[self._metric_name]).decode("ascii")

            f.seek(0)
            json.dump(db, f)

        self._buffer = []
        self._buffer_size = 0


class ExperimentLogger:
    """API for tracking the experiment progress.

    It saves values for the specified metrics in the specified log directory.
    Log file is named after the timestamp when the experiment was run.
    Metrics are saved as time-series in a JSON fashion.
    """

    def __init__(self, logdir: str = "runs", max_events: int = 100, log_interval: int = 0.5):
        """Initializes the module.

        Arguments:
            logdir: Directory where experiment log file will be created
            max_events: Maximum capacity for metric buffers.
                Buffers need to be filled completely before dumping the values to the log file.
            log_interval: Number of seconds after eaxh buffer dumps it's content to the log file.
                This event happends periodically after @log_interval seconds.
        """
        assert isinstance(logdir, str), f"Invalid type for log directory. Expected str, but received {type(logdir)}"
        self._logdir = logdir
        os.makedirs(logdir, exist_ok=True)
        init_time = time.strftime("%b-%d_%H-%M-%S")

        # Set up the event dump timer
        self._log_interval = log_interval
        self._log_timer = CallbackTimer(self._log_interval, self._dump_all)
        self._log_timer.start()

        self._metric_buffers = {}
        self._max_events = max_events

        # "_temp" folder is present when using the hyperparameter sweep option
        if os.path.exists(os.path.join(self._logdir, "_temp")):
            self._early_stopping = True
            self._early_stopping_log_file = os.path.join(os.path.join(self._logdir, "_temp"), "_temp.dat")
            with open(self._early_stopping_log_file, "r") as f:
                temp_log_data = json.load(f)
                self._early_stopping_metric = temp_log_data["metric_name"]

            self._logdir_complete = self._logdir
        else:
            self._early_stopping = False
            self._logdir_complete = os.path.join(logdir, init_time)

        os.makedirs(self._logdir_complete, exist_ok=True)
        # Create a log file
        self._db_path = os.path.join(self._logdir_complete, f"{init_time}.dat")
        with open(self._db_path, "w") as f:
            json.dump({}, f)

        self.init_timestamp = time.time()
        atexit.register(self._clean_up)

    def add_scalar(self, metric_name: str, value: Union[float, int], step: int):
        """Add the new value for the specified metric into it's according buffer.

        Arguments:
            metric_name: Metric for which we log the new value
            value: New value for the specified metric
            step: Can represent training step, epoch etc.
        """
        assert isinstance(metric_name, str), \
            f"Invalid metric_name type. Expected str but received {type(metric_name)}"
        assert type(value) in [float, int], \
            f"Invalid scalar type. Expected float or int but received {type(value)}"
        assert isinstance(step, int), \
            f"Invalid step type. Expected int but received {type(metric_name)}"

        if metric_name not in self._metric_buffers:
            self._register_buffer(metric_name, self._max_events)
        
        self._metric_buffers[metric_name].add_event(prepare_event(value, step, self.init_timestamp))

        if self._early_stopping:
            # In the case of early stopping we update the specified metric's last value
            if metric_name == self._early_stopping_metric:
                with open(self._early_stopping_log_file, "r+") as f:
                    temp_log_data = json.load(f)
                    temp_log_data["curr_value"] = value
                    f.seek(0)
                    json.dump(temp_log_data, f)
                    f.truncate()

        if not self._log_timer.is_on:
            self._log_timer.start()
        
    def _register_buffer(self, metric_name: str, buffer_capacity):
        """Registers metric which is being logged for the first time."""
        new_metric_buffer = MetricBuffer(
            db_path=self._db_path,
            metric_name=metric_name,
            buffer_capacity=buffer_capacity
        )
        self._metric_buffers[metric_name] = new_metric_buffer

    def _dump_all(self):
        """Logs content of each metric's buffer to the log file."""
        for buffer in self._metric_buffers.values():
            buffer.dump()
        self._log_timer.reset()

    def _clean_up(self):
        """Terminates running timers and dumps buffered metric values."""
        self._dump_all()
        self._log_timer.cancel()
