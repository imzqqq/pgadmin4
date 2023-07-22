define('pgadmin.browser.endpoints', [], function() {
  return {
    {% for endpoint, url in current_app.exposed_endpoint_url_map %}
      {% if loop.index != 1 %},{% endif %}
      '{{ endpoint|safe }}': '{{ url|safe }}'
    {% endfor %}
  };
});
