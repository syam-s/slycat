# Copyright 2013, Sandia Corporation. Under the terms of Contract
# DE-AC04-94AL85000 with Sandia Corporation, the U.S. Government retains certain
# rights in this software.

import cherrypy
import os
import pystache

def render(path, context):
  if render.templates is None:
    render.templates = os.path.join(cherrypy.tree.apps[""].config["slycat"]["server-resources"], "templates")
  if render.renderer is None:
    render.renderer = pystache.Renderer(search_dirs = render.templates)
  return render.renderer.render(open(os.path.join(render.templates, path), "r").read(), context)
render.templates = None
render.renderer = None
