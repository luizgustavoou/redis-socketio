const port = process.env.PORT || 3000;
const http = require("http");
const socketIo = require("socket.io");
const redis = require("redis");

// Criação do servidor HTTP e do Socket.IO
const server = http.createServer();
const io = socketIo(server);

const redisClient = redis.createClient({ host: "redis", port: 6379 });
const redisSubscriber = redisClient.duplicate();
redisSubscriber.subscribe("user-messages");

const userSocketMap = {};

io.on("connection", (socket) => {
    console.log("Usuário conectado: " + socket.id);

    socket.on("register", (userId) => {
        console.log(`Usuário registrado: ${userId}`);
        userSocketMap[userId] = socket.id;

        redisClient.hset("userSocketMap", userId, socket.id);
    });

    // Enviar mensagem para um usuário específico
    socket.on("sendMessage", (data) => {
        const { userId, message } = data;
        const targetSocketId = userSocketMap[userId];

        if (targetSocketId) {
            console.log("Enviar mensagem diretamente");
            io.to(targetSocketId).emit("receiveMessage", message);
        } else {
            console.log("Usuário não encontrado, publicando no Redis.");
            redisClient.publish(
                "user-messages",
                JSON.stringify({ userId, message })
            );
        }
    });

    // Quando o socket desconectar
    socket.on("disconnect", () => {
        console.log("Usuário desconectado: " + socket.id);
        for (let userId in userSocketMap) {
            if (userSocketMap[userId] === socket.id) {
                redisClient.hdel("userSocketMap", userId);
                delete userSocketMap[userId];
            }
        }
    });
});

redisSubscriber.on("message", (channel, message) => {
    console.log("[redisSubscriber]");
    console.log({
        channel,
        message,
    });

    if (channel === "user-messages") {
        const { userId, message: userMessage } = JSON.parse(message);
        const targetSocketId = userSocketMap[userId];

        if (targetSocketId) {
            io.to(targetSocketId).emit("receiveMessage", userMessage);
        } else {
            console.log(`Usuário ${userId} ainda não está conectado.`);
        }
    }
});

// Iniciar o servidor
server.listen(port, () => {
    console.log("Servidor Socket.IO rodando na porta ", port);
});
