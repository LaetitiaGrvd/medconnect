from flask import jsonify


def success_response(data=None, status=200):
    return jsonify({"success": True, "data": data}), status


def error_response(status, code, message):
    return jsonify({"success": False, "error": {"code": code, "message": message}}), status
