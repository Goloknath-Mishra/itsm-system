FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app/backend

ENV DJANGO_ALLOWED_HOSTS=*
ENV DJANGO_DEBUG=false

EXPOSE 8000

CMD ["sh", "-c", "gunicorn --chdir backend config.wsgi:application --bind 0.0.0.0:${PORT:-8000}"]

