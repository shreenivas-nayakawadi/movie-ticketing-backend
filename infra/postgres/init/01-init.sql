CREATE USER movie_app WITH CREATEDB PASSWORD 'movie_app';
CREATE DATABASE movie_ticketing OWNER movie_app;
GRANT ALL PRIVILEGES ON DATABASE movie_ticketing TO movie_app;
