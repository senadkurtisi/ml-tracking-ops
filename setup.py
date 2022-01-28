
import os
import io
from setuptools import setup


def read(path, encoding="utf-8"):
    path = os.path.join(os.path.dirname(__file__), path)
    with io.open(path, encoding=encoding) as fp:
        return fp.read()


NAME = "ml_tracking_ops"
AUTHOR = "Senad Kurtiši"
VERSION = "0.0.1"
LICENCE = "MIT"
PACKAGES = ["ml_tracking_ops", 'ml_tracking_ops.experiment', 'ml_tracking_ops.ml_tracking_ops']

DESCRIPTION = 'ML-Ops-Tracking: An ML Ops library which enables tracking and visualizing machine learning experiments '
LONG_DESCRIPTION = read("README.md")
LONG_DESCRIPTION_CONTENT_TYPE = "text/markdown"

ENTRY_POINTS = {
    "console_scripts": ['ml-tracking-ops = ml_tracking_ops.main:main']
}
INSTALL_REQUIREMENTS = [
    "flask>=1.1.2",
    "numpy>=1.21.2",
    "watchdog>=2.1.6"
]

setup(
    name=NAME,
    author=AUTHOR,
    licence=LICENCE,
    version=VERSION,
    description=DESCRIPTION,
    long_description=LONG_DESCRIPTION,
    long_description_content_type=LONG_DESCRIPTION_CONTENT_TYPE,

    packages=PACKAGES,
    entry_points=ENTRY_POINTS,
    include_package_data=True,
    zip_safe=False,
    install_requires=INSTALL_REQUIREMENTS,

    classifiers= [
        "Development Status :: 3 - Alpha",
        "Environment :: Console"
        "Operating System :: Microsoft :: Windows",
        "Intended Audience :: Science/Research",

        "Natural Language :: English",
    ],
)
