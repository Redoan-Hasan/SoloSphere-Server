const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: ["http://localhost:5174", "http://localhost:5173"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  // console.log("token from middlewale ;" , token);
  if (!token) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized Access" });
    }
    req.user = decoded;
    // console.log(req.user , decoded);
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qhz4s.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const jobsCollection = client.db("SoloSphere").collection("jobs");
    const bidsCollection = client.db("SoloSphere").collection("bids");

    // jwt
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "2d",
      });
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV == "production" ? true : false,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      });
      res.send({ success: true });
    });

    // token remove
    app.get("/logout", (req, res) => {
      res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV == "production" ? true : false,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      });
      res.send({ success: true });
    });

    app.get("/jobs", async (req, res) => {
      const result = await jobsCollection.find().toArray();
      res.send(result);
    });

    // getting single data for job details
    app.get("/job/:id", verifyToken, async (req, res) => {
      const id = req?.params?.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });
    // saving single job data
    app.post("/job", async (req, res) => {
      const job = req.body;
      const result = await jobsCollection.insertOne(job);
      res.send(result);
    });

    // getting all jobs posted by a specific user
    app.get("/postedJobs/:email", verifyToken, async (req, res) => {
      const tokenEmail = req?.user?.email;
      const email = req?.params?.email;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const query = { "buyer.email": email };
      const result = await jobsCollection.find(query).toArray();
      res.send(result);
    });

    // delete one specific job
    app.delete("/postedJob/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.deleteOne(query);
      res.send(result);
    });

    // fetching data for update a specific job
    app.get("/updateJob/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });

    // updating a specific job
    app.put("/updatedJob/:id", async (req, res) => {
      const id = req.params.id;
      const job = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = { $set: { ...job } };
      const result = await jobsCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    // saving a bid details
    app.post("/bid", async (req, res) => {
      const bid = req.body;

      // checking if it is a duplicate bid request
      const alreadyApplied = await bidsCollection.findOne({
        email: bid.email,
        jobId: bid.jobId,
      });
      console.log(alreadyApplied);
      if (alreadyApplied) {
        console.log("already placed a bid on this");
        return res
          .status(400)
          .send("you have already placed a bid on this job");
      } else {
        const result = await bidsCollection.insertOne(bid);
        res.send(result);
      }
    });

    // getting all the bid posted by me/user
    app.get("/myBids/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await bidsCollection.find(query).toArray();
      res.send(result);
    });

    // getting bid request for job owner
    app.get("/bidRequests/:email", async (req, res) => {
      const email = req.params.email;
      const query = { buyer_email: email };
      const result = await bidsCollection.find(query).toArray();
      res.send(result);
    });

    // update bid status
    app.patch("/bidStatus/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      console.log(status);
      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status: status } };
      const result = await bidsCollection.updateOne(query, updateDoc);
      console.log(result);
      res.send(result);
    });

    // pagination
    // all jobs count
    app.get("/allJobsCount", async (req, res) => {
      const filter = req?.query?.filter;
      // let query = {};
      // if(filter) query = {category: filter}
      const count = await jobsCollection.countDocuments(
        filter ? { category: filter } : {}
      );
      res.send({ count });
    });

    // there is another way to filter here it is
    // .find(filter ? { category: filter } : {})

    // sending separate data
    app.get("/allJobs", async (req, res) => {
      const page = parseInt(req?.query?.page) - 1;
      const size = parseInt(req?.query?.size);
      const filter = req?.query?.filter;
      const sort = req?.query?.sort;
      const search = req?.query?.search;
      console.log(page, size, filter, sort, search);
      let query = {
        job_title: { $regex: search, $options: "i" },
      };
      if (filter) query.category = filter;
      let options = {};
      if (sort) options = { sort: { deadline: sort === "asc" ? 1 : -1 } };
      const result = await jobsCollection
        .find(query, options)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
