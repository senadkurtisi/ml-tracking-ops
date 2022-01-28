from typing import Union, List, Tuple
from random import choice

import numpy.random as np_random


class HyperparameterSampler:
    def __init__(self):
        self.sampler_type = None

    def get_str_representation(self):
        raise NotImplementedError()

    def __str__(self):
        return self.get_str_representation()

    def __repr__(self):
        return self.get_str_representation()


class Choice(HyperparameterSampler):
    def __init__(self, hyperparameter_values: Union[List, Tuple]):
        assert type(hyperparameter_values in [List, Tuple]), \
            f"Invalid hyperparameter list type. Expected List or Tuple but received {type(hyperparameter_values)}"
        super(HyperparameterSampler, self).__init__()
        self._hyperparameter_values = hyperparameter_values
        self.sampler_type = "choice"

    def sample(self):
        return choice(self._hyperparameter_values)
    
    def get_str_representation(self):
        hyperparam_vals_str = [str(val) for val in self._hyperparameter_values]
        representation = f"Choice[{', '.join(hyperparam_vals_str)}]"
        return representation


class Uniform(HyperparameterSampler):
    def __init__(self, lower_bound: Union[float, int], upper_bound: Union[float, int]):
        assert isinstance(lower_bound, float), \
            f"Invalid type for lower_bound parameter. Expected float or int but received {type(lower_bound)}"
        assert isinstance(upper_bound, float), \
            f"Invalid type for upper_bound parameter. Expected float or int but received {type(upper_bound)}"
        super(HyperparameterSampler, self).__init__()
        self._lower_bound = lower_bound
        self._upper_bound = upper_bound
        self.sampler_type = "uniform"

    def sample(self):
        return np_random.uniform(low=self._lower_bound, high=self._upper_bound)

    def get_str_representation(self):
        representation = f"Uniform({self._lower_bound}, {self._upper_bound})"
        return representation
