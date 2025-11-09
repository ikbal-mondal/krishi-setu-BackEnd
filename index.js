const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const { readFileSync } = require("fs");
const admin = require("firebase-admin");

const app = express();
const port = 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.get("/", (req, res) => {
  res.send("Krishi-Setu Server is running ");
});

// MongoDB setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.azkcydb.mongodb.net/?appName=Cluster0`;

//  Load Firebase Admin credentials
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
console.log(" Firebase Admin initialized successfully!");

//  Mongo client setup
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

//  Verify Firebase token middleware
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.firebase?.sign_in_provider,
    };
    next();
  } catch (err) {
    console.error("Token verification failed:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
}

async function run() {
  try {
    // await client.connect();
    const db = client.db("Krishi-Setu");
    const cropsCollection = db.collection("crops");

    console.log(" MongoDB connected successfully!");

    // ===============================
    //  Add New Crop (Private Route)
    // ===============================
    app.post("/api/crops", verifyFirebaseToken, async (req, res) => {
      try {
        const crop = req.body;

        // Validation
        const required = [
          "name",
          "type",
          "pricePerUnit",
          "unit",
          "quantity",
          "description",
          "location",
          "image",
          "owner",
        ];
        for (const key of required) {
          if (!crop[key]) {
            return res.status(400).json({ error: `${key} is required` });
          }
        }

        crop.createdAt = new Date();
        crop.status = "pending";
        crop.interests = [];

        const result = await cropsCollection.insertOne(crop);
        return res.status(201).json({
          message: "Crop added successfully",
          insertedId: result.insertedId,
        });
      } catch (err) {
        console.error(" Error adding crop:", err);
        res.status(500).json({ error: "Failed to add crop" });
      }
    });

    // ===============================
    //  Get All Crops
    // ===============================
    app.get("/api/crops", async (req, res) => {
      try {
        const crops = await cropsCollection
          .find()
          .sort({ createdAt: -1 })
          .limit(50)
          .toArray();
        res.json(crops);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch crops" });
      }
    });

    // ===============================
    //  Get Single Crop by ID
    // ===============================
    app.get("/api/crops/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const crop = await cropsCollection.findOne({ _id: new ObjectId(id) });
        if (!crop) return res.status(404).json({ error: "Crop not found" });
        res.json(crop);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch crop" });
      }
    });

    // ===============================
    //  Create Interest (Private)
    // ===============================
    app.post(
      "/api/crops/:id/interests",
      verifyFirebaseToken,
      async (req, res) => {
        try {
          const cropId = req.params.id;
          const crop = await cropsCollection.findOne({
            _id: new ObjectId(cropId),
          });
          if (!crop) return res.status(404).json({ error: "Crop not found" });

          const userEmail = req.user.email;
          if (crop.owner?.ownerEmail === userEmail) {
            return res
              .status(400)
              .json({ error: "Owners cannot send interest on their own crop" });
          }

          const { quantity, message, userName } = req.body;
          const qtyNum = Number(quantity);
          if (!qtyNum || qtyNum < 1) {
            return res.status(400).json({ error: "Quantity must be >= 1" });
          }

          const already = (crop.interests || []).find(
            (i) => i.userEmail === userEmail
          );
          if (already) {
            return res.status(400).json({
              error: "You have already sent an interest for this crop",
            });
          }

          const interestObj = {
            _id: new ObjectId(),
            cropId,
            userEmail,
            userName: userName || req.user.name || "",
            quantity: qtyNum,
            message: message || "",
            status: "pending",
            createdAt: new Date(),
          };

          const updateResult = await cropsCollection.updateOne(
            { _id: new ObjectId(cropId) },
            { $push: { interests: interestObj } }
          );

          if (updateResult.modifiedCount === 1) {
            return res.status(201).json({ ok: true, interest: interestObj });
          } else {
            return res.status(500).json({ error: "Could not add interest" });
          }
        } catch (err) {
          console.error(" Error creating interest:", err);
          res.status(500).json({ error: "Server error" });
        }
      }
    );

    //  Get all interests sent by logged-in user
    app.get("/api/my-interests", verifyFirebaseToken, async (req, res) => {
      try {
        const userEmail = req.user.email;
        const db = client.db("Krishi-Setu");
        const cropsCollection = db.collection("crops");

        // Find all crops that have an interest from this user
        const crops = await cropsCollection
          .find({ "interests.userEmail": userEmail })
          .toArray();

        const userInterests = [];

        crops.forEach((crop) => {
          (crop.interests || []).forEach((i) => {
            if (i.userEmail === userEmail) {
              userInterests.push({
                _id: i._id,
                cropId: crop._id,
                cropName: crop.name,
                ownerName: crop.owner?.ownerName || "Unknown",
                quantity: i.quantity,
                totalPrice: i.quantity * crop.pricePerUnit,
                status: i.status,
                message: i.message,
                createdAt: i.createdAt || crop.createdAt,
              });
            }
          });
        });

        res.status(200).json(userInterests);
      } catch (err) {
        console.error(" Error fetching user interests:", err);
        res.status(500).json({ error: "Failed to fetch interests" });
      }
    });

    // ===============================
    //  Accept/Reject Interest
    // ===============================
    app.put(
      "/api/crops/:cropId/interests/:interestId",
      verifyFirebaseToken,
      async (req, res) => {
        try {
          const { cropId, interestId } = req.params;
          const { status } = req.body;
          if (!["accepted", "rejected"].includes(status))
            return res.status(400).json({ error: "Invalid status" });

          const crop = await cropsCollection.findOne({
            _id: new ObjectId(cropId),
          });
          if (!crop) return res.status(404).json({ error: "Crop not found" });

          if (crop.owner?.ownerEmail !== req.user.email) {
            return res.status(403).json({ error: "Not authorized" });
          }

          const interest = (crop.interests || []).find(
            (i) => i._id && i._id.toString() === interestId
          );
          if (!interest)
            return res.status(404).json({ error: "Interest not found" });
          if (interest.status !== "pending")
            return res.status(400).json({ error: "Action already taken" });

          const updateOps = { $set: { "interests.$[elem].status": status } };
          const arrayFilters = [{ "elem._id": new ObjectId(interestId) }];

          if (status === "accepted") {
            const newQty = (crop.quantity || 0) - (interest.quantity || 0);
            updateOps.$set["quantity"] = newQty >= 0 ? newQty : 0;
          }

          const result = await cropsCollection.updateOne(
            { _id: new ObjectId(cropId) },
            updateOps,
            { arrayFilters }
          );

          if (result.modifiedCount === 1) {
            return res.json({ ok: true, status });
          } else {
            return res.status(500).json({ error: "Could not update interest" });
          }
        } catch (err) {
          console.error(" Error updating interest:", err);
          res.status(500).json({ error: "Server error" });
        }
      }
    );

    //  Get all crops of logged-in user
    app.get("/api/my-posts", verifyFirebaseToken, async (req, res) => {
      try {
        const db = client.db("Krishi-Setu");
        const cropsCollection = db.collection("crops");
        const email = req.user.email;

        const myCrops = await cropsCollection
          .find({ "owner.ownerEmail": email })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json(myCrops);
      } catch (err) {
        console.error(" Error fetching my posts:", err);
        res.status(500).json({ error: "Failed to fetch user crops" });
      }
    });

    //  Update crop
    app.put("/api/crops/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const db = client.db("Krishi-Setu");
        const cropsCollection = db.collection("crops");
        const { id } = req.params;
        const email = req.user.email;

        const crop = await cropsCollection.findOne({ _id: new ObjectId(id) });
        if (!crop) return res.status(404).json({ error: "Crop not found" });

        if (crop.owner.ownerEmail !== email)
          return res.status(403).json({ error: "Not authorized" });

        const updated = await cropsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: req.body }
        );

        res.status(200).json({ message: "Crop updated successfully", updated });
      } catch (err) {
        console.error(" Error updating crop:", err);
        res.status(500).json({ error: "Failed to update crop" });
      }
    });

    //  Delete crop
    app.delete("/api/crops/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const db = client.db("Krishi-Setu");
        const cropsCollection = db.collection("crops");
        const { id } = req.params;
        const email = req.user.email;

        const crop = await cropsCollection.findOne({ _id: new ObjectId(id) });
        if (!crop) return res.status(404).json({ error: "Crop not found" });

        if (crop.owner.ownerEmail !== email)
          return res.status(403).json({ error: "Not authorized" });

        await cropsCollection.deleteOne({ _id: new ObjectId(id) });
        res.status(200).json({ message: "Crop deleted successfully" });
      } catch (err) {
        console.error(" Error deleting crop:", err);
        res.status(500).json({ error: "Failed to delete crop" });
      }
    });
  } catch (error) {
    console.error(" Error:", error);
  }
}
run();

// Start the server
app.listen(port, () => {
  console.log(` Krishi-Setu Server running on port ${port}`);
});
