<div align="center">
  <img src="imgs\logo.png" width="771.75px" height="283.5">
</div>

[![Python 3.9](https://img.shields.io/badge/python-3.9-blue.svg)](https://www.python.org/downloads/release/python-397/)

</br>
ML Tracking Ops represents an MLOps Python library/platform which can be used for tracking machine learning projects. This platform enables users to track distinct training runs and complete hyperparameter sweeps.</br>

### ML Tracking Ops:
* Exposes an API to the user which enables them to log Machine Learning/Data Science metrics during training
* Enables users to initiate a hyperparameter sweep and log the sweep artifacts
* Enables users to start an interactive web app for visualizing the experiment results. In this app they can
compare different experiments and visualize different metrics
* It enables users to compare different training runs executed within the same hyperparameter sweep

### Table of Contents:
* [Simplest form of tracking runs](#simplest-form-of-tracking-runs)
* [Hyperparameter Sweeps](#hyperparameter-sweeps)
* [ML Tracking Ops Web App](#ml-tracking-ops-web-app)
  * [Demo](#short-demos)
* [An Important Note](#an-important-note)
* [Licence](#licence)


## Simplest form of tracking runs

Below we can see a PyTorch example of how we can track an experiment using ML-Tracking-Ops.

ML Tracking Ops is *library agnostic*, i.e. you do not have to use PyTorch. As long as the `ExperimentLogger.add_scalar` is provided with a simple `float` the experiment logging process will be possible.

```python

from ml_tracking_ops.experiment.logger import ExperimentLogger

...
# Dataset setup, model instantiation etc.
...

writer = ExperimentLogger(logdir="runs")
max_epochs = 10
for epoch in range(max_epochs):
    print("Epoch:", epoch)
    for x, y_true in dataloader:
        train_step += 1

        optimizer.zero_grad()
        y_pred = model(x)
        loss = loss_fcn(y_pred, y_true)
        loss.backward()
        optimizer.step()

        # We need to pass the scalar value in the form of a simple 'float'
        writer.add_scalar("Loss", loss.item(), train_step)

```

When an instance of `ExperimentLogger` is created a directory with the name corresponding to the argument `logdir` is created (if it didn't previously exist). In this `logdir` directory a new directory gets created which corresponds to the time the instance of `ExperimentLogger` was created. This directory contains logs related to the training run started at the time indicated by the directory name. Each of these directories contains a single `.dat` file which contains time-series logs for each metric logged during that particular training run. See image below for an example.

<p align="left" id="runs-structure">
  <img src="imgs\runs_structure.PNG" height="69px" width="495px"/>
</p>

Each of these folders represents a different training run (possibly after changing some hyperparameters). This `logdir` directory should be used to group different training runs so they can be easily compared by using the ML Tracking Ops [web app](#ml-tracking-ops-web-app)

## Hyperparameter Sweeps

ML Tracking Ops enables users to run a hyperparameter sweep for their machine learning pipeline.
This is relatively easy to do since all you need is defining a simple configuration file and an argument parser.
</b>
After defining those two things we can start the hyperparameter sweep with a simple command
```bash
ml-tracking-ops --run_sweep=True --logdir=runs
```

* Passing the argument `logdir` is not mandatory since it it will default to the string `runs`.
* When the sweep is started a directory with the name corresponding to the argument `logdir` is created (if it didn't previously exist). In this `logdir` directory a new directory gets created which corresponds to the time the sweep was started. This directory contains a `experiment_description.json` file which is automatically created and describes the configuration of the sweep (*this is used by the [web app](#ml-tracking-ops-web-app) and* ***SHOULD NOT*** *be deleted*).
* Besides this file a separate `.dat` file gets created for each hyperparameter combination tried. These files contain time-series logs created by the `ExperimentLogger` instances created inside of the training script specified in the configuration file every time a new training run is started. This file is named by the timestamp at which the training process for the new hyperparameter combination was started.

* On the other hand specifying the `--run_sweep=True` is necessary since not passing this argument will result in the value `False` which would lead to starting the ML Tracking Ops [web app](#ml-tracking-ops-web-app)

### Sweep configuration file

This file is used to explain:
* What hyperparameters you wish to explore and how to sample them
* What is the entry point for training your model
* How many different hyperparameter combinations you wish to try. *NOTE: Hyperparameter search is not exhaustive, and is thereby limited by the specified maximum number of training runs.*
* Do we wish to apply early stopping to each of the training runs
    * If yes, to which metric should we pay attention to when trying to optimize the model
    * Is the optimization process maximizing or minimizing the `optimization_metric`?

**This file must be named "experiment_cfg.json"**</br>
Below we can see an example of the configuration file. The JSON object keys `main_script_name`, `max_runs`, `hyperparameters` and `early_stopping` must be present. 

```json

{
    "main_script_name": "train_script.py",
    "hyperparameters": {
        "learning_rate": {
            "type": "uniform",
            "min": 1e-5,
            "max": 1e-2
        },
        "batch_size": {
            "type": "choice",
            "candidates": [32, 64, 128]
        },
        "train_steps": {
            "type": "choice",
            "candidates": [700, 850, 1000]
        }
    },
    "max_runs": 100,
    "early_stopping": true,

    "early_stopping_patience": 5, 
    "optimization_metric": "Accuracy",
    "optimization_goal": "max"
}

```

* In the example above we can see that hyperparameters we wish to explore must be defined in a specific format. Each hyperparameter must have a key `type` which can take values of `uniform` which represents a *continuous parameter*, or `choice` which represents a *discrete parameter*. 
The other keys like `min`, `max`, `candidates` are required for the according hyperparameter type i.e. `min` and `max` are required for using `uniform` sampling and `candidates` is required when using a `discrete` sampling.
Hyperparameters can have any name the user wants them to have. *Note: these names must match with the expected hyperparameter names in the script specified with the* `main_script_name.py`.

* We should specify if we wish to apply the *EarlyStopping* strategy to each of the training runs. If we set the property `early_stopping` to `true`, then we must specify the other properties as well:
    * `optimization_metric` The metric which we need to track in order to decide should the *EarlyStopping* event occur
    * `early_stopping_patience` represents the maximum number of steps (during which the metric was logged) during which the metric specified by the `optimization_metric` parameter is allowed not to improve. When this threshold is reached, *EarlyStopping* event triggers and the training process (for the current hyperparameter combination) terminates.
    * `optimization_goal` This parameter serves as a way to keep track if the metric has improved or not. It can take the values of `max` and `min` which correspond to maximization and minimization of the `optimization_metric`, respectively.


**Note**</br>
*Both the configuration file* `experiment_cfg.json` *and the training script specified in the* `main_script_name` *must be present in the* ***current working directory*** where the `ml-tracking-ops --run_sweep=True --logdir=runs` command will be run.


### Argument Parser

In each training run we sample a hyperparameter combination according to the previously specified sampling preferences. After this step your training script specified in the `main_script_name` in the `experiment_cfg.json` file is started as a separate *subprocess* and sampled hyperparameters are passed to it in the form of *command line arguments*.
</br>

This means that in order to use the exact sampled values of these hyperparameters we need to have an argument parser instance inside of our training script. *This argument parser needs to be able to accept the arguments for which the names are equal to the ones defined in the* `experiment_cfg.json` *in the* `hyperparameters` *section*.

Below we can see an example of this argument parser. This parser was designed in order to be able to accept hyperparameters defined in the `experiment_cfg.json` example above.

```python

from argparse import ArgumentParser

parser = ArgumentParser()
# Having this argument is really important since you would need to pass this argument when creating ExperimentLogger instance
parser.add_argument("--logdir", type=str, default="runs)

parser.add_argument("--learning_rate", type=float, default=1e-3)
parser.add_argument("--batch_size", type=int, default=32)
parser.add_argument("--train_steps", type=int, default=1000)
# Collect arguments (sampled hyperparameter values) that got passed when the training script was started
config = parser.parse_args()

```


## ML Tracking Ops Web App

We can start the ML Tracking Ops web app by running a simple command

```bash
ml-tracking-ops --logdir=runs
```

The `logdir` argument represents the directory which contains the experiment and sweep logs which we would like to observe and analyze.
Passing the `logdir` argument is optional since not passing it will default to the string `runs` but be aware of this behavior since the directory `runs` may not contain the logs you are interested in or may not exist at all!

After running the previous command our app starts on a local server `127.0.0.1:5000` or `localhost:5000`. Visiting any of these two addresses will result to immediate redirect to a page where different experiment runs are properly visualized. An example of a page you would see when you start the app is given below.
</br>
<p align="left">
  <img src="imgs\home_example.PNG" height="410px" width="830px"/>
</p>


### Experiments section
As we can see on the **Experiments** tab below, the sidebar contains the list of all experiments present in the specified `logdir` directory. This does not include logs which correspond to hyperparameter sweeps.

When an experiment is selected all of the metrics which were logged in it's [according log file(directory)](#runs-structure) are displayed on their separate graphs.</br>

As we can see there is also a possibility for us to select multiple experiments at once and compare different experiments. In this case the graphs for different experiments are drawn on top of one another so it would be easier to compare different training runs. We can see below an example of such case.
</br>
<p align="left">
  <img src="imgs\multiple_runs_example.PNG" height="410px" width="830px"/>
</p>


### Sweeps section
As we can see on the **Sweeps** tab below, the sidebar contains the list of all hyperparameter sweeps present in the specified `logdir` directory. This does not include logs which correspond to regular training runs which aren't sweeps.

Below we can see an example of how this tab can look like
</br>
<p align="left">
  <img src="imgs\sweeps_example.PNG" height="410px" width="830px"/>
</p>

When a sweep is selected all of the data relevant for that sweep is displayed.

#### **Hyperparameter Sweep Summary**
This section describes the content of the `experiment_cfg.json` file in a structured and visually appealing way. This section gets automatically created.
<p align="left">
  <img src="imgs\summary.PNG" width="490px" height="375px"/>
</p>

#### **Training runs table**
This table contains description of every training run started during the sweep. The description consists out of the exact values of hyperparameters which correspond to that particular run and the best value of the metric specified in the `optimization_metric` field. If no value was given for that field, this column won't be present in the table.
<p align="left">
  <img src="imgs\runs_table.PNG" width="600px" height="185px"/>
</p>

#### **A metric chart**
As we can see below, on this chart we can see the selected metric for every run that is present on the *current* page of the table. As we can see below *EarlyStopping* event was triggered for some the runs present on the current page.
<p align="left">
  <img src="imgs\metric_chart_sweeps.png" width="490px" height="375px"/>
</p>


### Short demos

* Here is a short demo of usage of [Experiments](#experiments-section) tab


https://user-images.githubusercontent.com/19266082/151616781-2aef9fec-5bb9-4c22-9823-553e95bf34c4.mp4


</br>

* Here is a short demo of usage of [Sweeps](#sweeps-section) tab


https://user-images.githubusercontent.com/19266082/151616800-91797e43-fa2f-470d-a0b6-52e29e3ab11b.mp4



## An Important Note

This tool was created as a part of my learning process and therefore is provided "as is".

**Use this tool at your own risk.**

## Licence
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
