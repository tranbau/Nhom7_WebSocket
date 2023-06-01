const app = require("express")();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const port = process.env.PORT || 3000;
const faker = require("@faker-js/faker");
var onlineUsers = new Map();
var numUser = 0; //both connect + disconnect

var listPrivateChat = new Map(); //user - list private chat with user
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

io.on("connection", (socket) => {
  console.log("A user connected");
  numUser++;

  //fake name => different for all users
  const username = `user${numUser}`;
  onlineUsers.set(socket.id, username);
  listPrivateChat.set(socket.id, []);
  //send fake userName for client
  socket.emit("yourName", username);

  //broad cast onlineUsers
  io.emit("onlineUsers", Array.from(onlineUsers.values()));

  //broad cast newMessage
  socket.on("sendMsg", (msg) => {
    io.emit("sendMsg", username, msg);
  });

  //chat 1vs1
  socket.on("wantChat", (from, to) => {
    let toID = null;
    let fromID = socket.id;
    //find id
    for (let [key, value] of onlineUsers.entries()) {
      if (value === to) {
        toID = key;
        break;
      }
    }
    //not found
    if (!toID) {
      console.log(to, "not found");
      socket.emit("wantChat", "Faild: not found client");
      return;
    }

    //emit to send command client
    listPrivateChat.set(fromID, [...listPrivateChat.get(fromID), toID]);
    socket.emit("wantChat", "Succesfully", to);

    //emit to the other client
    listPrivateChat.set(toID, [...listPrivateChat.get(toID), fromID]);
    io.to(toID).emit("letChat", from);
  });

  socket.on("privateMsg", (from, to, msg) => {
    let toID = null;
    //find the other client
    for (let [key, value] of onlineUsers.entries()) {
      if (value === to) {
        toID = key;
        break;
      }
    }
    //send message to other
    io.to(toID).emit("privateMsg", from, msg);
  });

  socket.on("stopChat", (from, to) => {
    let toID = null;
    let fromID = socket.id;
    //find id
    for (let [key, value] of onlineUsers.entries()) {
      if (value === to) {
        toID = key;
        break;
      }
    }

    //remove private list of both
    const fromRemovedList = listPrivateChat
      .get(fromID)
      .filter((id) => id !== toID);
    listPrivateChat.set(fromID, fromRemovedList);

    const toRemovedList = listPrivateChat
      .get(toID)
      .filter((user) => user !== fromID);
    listPrivateChat.set(fromID, toRemovedList);

    //emit to destination
    io.to(toID).emit("stopChat", from);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
    //broad cast user left to all users
    io.emit("userLeft", onlineUsers.get(socket.id));

    //broad cast stop chat to all private chat user
    const listPrivate = listPrivateChat.get(socket.id);
    if (listPrivate) {
      listPrivate.map((id) => {
        io.to(id).emit("stopChat", onlineUsers.get(socket.id));
      });
    }
    //remove user
    listPrivateChat.delete(socket.id);
    onlineUsers.delete(socket.id);
  });
});

http.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}/`);
});
