# Copyright (c) 2013, 2018 National Technology and Engineering Solutions of Sandia, LLC. 
# Under the terms of Contract DE-NA0003525 with National Technology and Engineering 
# Solutions of Sandia, LLC, the U.S. Government retains certain rights in this software.

# This script creates a Python distribution wheel for the Slycat
# web client.  When run, it copies the latest version of slycat.web.client
# into the slycat_web_client directory 
#
# S. Martin
# 10/23/2020

# To publish to PyPi, perform the following steps:
#
# $ python setup.py sdist bdist_wheel
# $ twine upload dist/*
#
# The first step builds the distribution, and the second step
# uploads to PyPi.  To install the package from another computer use:
#
# $ pip install slycat-web-client

from shutil import copyfile

# copy slycat.web.client and slycat.darray into slycat_web_client directory. This
# makes the slycat_web_directory a Python package without other Slycat dependencies.
copyfile('../packages/slycat/web/client/__init__.py', 
    'slycat_web_client/slycat/web/client/__init__.py')
copyfile('../packages/slycat/darray.py', 'slycat_web_client/slycat/darray.py')

# also copy the __init__.py files, which include the Slycat version number
copyfile('../packages/slycat/__init__.py', 'slycat_web_client/slycat/__init__.py')
copyfile('../packages/slycat/web/__init__.py', 'slycat_web_client/slycat/web/__init__.py')

# get Slycat version
import slycat_web_client.slycat
VERSION = slycat_web_client.slycat.__version__

# get README.md
import pathlib

# directory containing this file
HERE = pathlib.Path(__file__).parent

# text of the web-client-readme.txt file
README = (HERE / "README.md").read_text()

# create distribution
import setuptools

# create Python wheel
from setuptools import setup

setup(
    name="slycat-web-client",
    version=VERSION,
    description="Slycat web client utilties for interacting with the Slycat " +
                "data analysis and visualizatuion server.",
    long_description=README,
    long_description_content_type="text/markdown",
    url="https://github.com/sandialabs/slycat",
    author="Shawn Martin",
    author_email="smartin@sandia.gov",
    license="Sandia",
    classifiers=[
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
    ],
    packages=setuptools.find_packages(),
    include_package_data=True,
    install_requires=["requests", "requests_gssapi",
                      "numpy", "cherrypy"],
    entry_points={
        "console_scripts": [
            "dac_tdms=slycat_web_client.dac_tdms:main",
            "dac_tdms_batch=slycat_web_client.dac_tdms_batch:main"
        ]
    },
)