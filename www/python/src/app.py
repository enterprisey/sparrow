import flask
import os
import configparser
import mwoauth
from requests_oauthlib import OAuth1
import requests

CONFIG_FILENAME = "config.ini"

app = flask.Flask(__name__)

# Load configuration
curr_dir = os.path.dirname(__file__)
config = configparser.ConfigParser()
config.optionxform = str
config.read(os.path.join(curr_dir, CONFIG_FILENAME))
app.config.update(dict(config.items("CREDS")))

# Generate consumer token
consumer_token = mwoauth.ConsumerToken(
  app.config["CONSUMER_KEY"], app.config["CONSUMER_SECRET"])

@app.route('/')
def index():
  username = flask.session.get("username", None)
  if username:
    return flask.render_template("yabbr.html", username=username)
  else:
    return flask.render_template("index.html")

@app.route("/edit", methods=["GET", "POST"])
def edit():
  username = flask.session.get("username", None)
  if not username or flask.request.method == "GET":
    return flask.render_template("index.html")

  # We'll need this auth1 param for all of our requests 
  access_token_dict = flask.session.get("access_token")
  auth1 = OAuth1(consumer_token.key, consumer_token.secret, access_token_dict["key"], access_token_dict["secret"])

  edit_token = flask.session.get("edit_token", None)
  if not edit_token:
    query_params = {
      'action': "query",
      'meta': 'tokens',
      'format': "json"
    }
    response = requests.get("https://en.wikipedia.org/w/api.php", params=query_params, auth=auth1)
    print(response.json())
    edit_token = response.json()["query"]["tokens"]["csrftoken"]
    flask.session["edit_token"] = edit_token 

  text = flask.request.form.get("text", None)
  title = flask.request.form.get("title", None)
  summary = flask.request.form.get("summary", None)
  if not text or not title or not summary:
    response = {"error": "The following required parameters weren't supplied: " + ", ".join([x[0] for x in [("text", text), ("title", title), ("summary", summary)] if not x[1]])}
    return flask.jsonify(response)
  query_params = {
    "action": "edit",
    "title": title,
    "summary": summary,
    "format": "json"
  }
  query_data = {
    "token": edit_token,
    "text": text
  }
  response = requests.post("https://en.wikipedia.org/w/api.php", params=query_params, data=query_data, auth=auth1)
  return flask.jsonify(response.json())

@app.route("/login")
def login():
  try:
    redirect, request_token = mwoauth.initiate(app.config["OAUTH_MWURI"], consumer_token)
  except Exception:
    app.logger.exception("mwoauth.initiate failed")
    return flask.redirect(flask.url_for('index'))
  else:
    # Convert request_token into a dictionary
    request_token_dict = dict(zip(request_token._fields, request_token))
    flask.session["request_token"] = request_token_dict
    return flask.redirect(redirect)

@app.route("/oauth-callback")
def oauth_callback():
  if "request_token" not in flask.session:
    app.logger.exception("OAuth callback failed. Are cookies disabled?")
    return flask.redirect(flask.url_for("index"))
  try:
    access_token = mwoauth.complete(app.config["OAUTH_MWURI"], consumer_token, mwoauth.RequestToken(**flask.session["request_token"]), flask.request.query_string)
    identity = mwoauth.identify(app.config["OAUTH_MWURI"], consumer_token, access_token)
  except Exception:
    app.logger.exception("OAuth authentication failed.")
  else:
    flask.session["access_token"] = dict(zip(access_token._fields, access_token))
    flask.session["username"] = identity["username"]

  # Check for at least 2K edits
  query_params = {
    "action": "query",
    "list": "users",
    "ususers": identity["username"],
    "usprop": "editcount",
    "format": "json"
  }
  response = requests.get("https://en.wikipedia.org/w/api.php", params=query_params)
  print(response.content)
  if response.json()["query"]["users"][0]["editcount"] < 2000:
    flask.flash("Your edit count needs to be at least 2000 to use this tool.")
    flask.session.clear()
    return flask.render_template("error.html", text="Your edit count needs to be at least 2000 to use this tool!")

  return flask.redirect(flask.url_for("index"))

@app.route('/logout')
def logout():
  """Log the user out by clearing their session."""
  flask.session.clear()
  return flask.redirect(flask.url_for('index'))
