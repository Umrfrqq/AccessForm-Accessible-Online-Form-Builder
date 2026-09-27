import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const options = {};

class Singleton {
  static #instance;
  #client;
  #clientPromise;

  constructor() {
    this.#client = new MongoClient(uri, options);
    this.#clientPromise = this.#client.connect();
    if (process.env.NODE_ENV === 'development') {
      global._mongoClientPromise = this.#clientPromise;
    }
  }

  static get instance() {
    if (!this.#instance) {
      this.#instance = new Singleton();
    }
    return this.#instance;
  }

  get clientPromise() {
    return this.#clientPromise;
  }
}

const clientPromise = Singleton.instance.clientPromise;

export default clientPromise;