const { Client, LocalAuth } = require('whatsapp-web.js');
const file = require("fs");
const app = require("express")();
const bodyParser = require('body-parser')

let activeSession = false;
let chatData = {
    // "reciever":{
    //     "chatId":"",
    //     "data":["","",""],
    // }
};
let qr = "";
let temp = undefined;

///APIS

app.use(bodyParser.json());

app.get("/get-qr",async(req,res)=>{
    try{
        if(activeSession){
            throw Error("User already logged in.");
        }
        else if(!!!qr){
            throw Error("QR not available. Try again later.");
        }
        res.status(201).send({qr:qr});
    }
    catch(error){
        res.status(400).send({message:error.message});
    }
});

app.get("/get-messages/:id",async(req,res)=>{
    try{
        if(!activeSession){
            throw Error("User not logged in.");
        }
        let receiverNumber = req.params.id;
        if(!id){
            throw Error("Sender contact number not provided.");
        }

        let messageArray = [...(JSON.parse(chatData[`${receiverNumber}`].data))];

        res.status(201).send({messages:[...messageArray]});
    }
    catch(error){
        res.status(400).send({message:error.message});
    }
});

app.post("/send-message",async(req,res)=>{
    try{
        if(!activeSession){
            throw Error("User not logged in.");
        }
        let {receiver,message} = req.body;
        if(!!!receiver || !!!message){
            throw Error("Missing contact number or message.");
        }

        let chatId = receiver.toString()+"@c.us";

        currentClient.sendMessage(chatId, message);

        res.status(201).send();
    }
    catch(error){
        res.status(400).send({message:error.message});
    }
});

app.post("/update-profile-pic",async(req,res)=>{
    try{
        if(!activeSession){
            throw Error("User not logged in.");
        }
        // let {receiver,message} = req.body;
        //     currentClient.setProfilePicture({
        //         data: image,
        //         filename:"profileImg.png",
        //         filesize:155000,
        //         mimetype:"image/png"});
        //     }

        // currentClient.deleteProfilePicture();

        res.status(201).send();
    }
    catch(error){
        res.status(400).send({message:error.message});
    }
});


//WHATSAPP-WEB SOCKET

const currentClient = new Client({
    authStrategy:new LocalAuth(),
    puppeteer:{
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

currentClient.on('qr', (qrcode) => {
    console.log('QR RECEIVED', qrcode);
    qr = qrcode;
});

currentClient.on('ready', () => {
    console.log('Client is ready!');
    activeSession = true;
    qr="";
});

currentClient.on('disconnected', () => {
    console.log('Client disconnected!');
    activeSession = false;
});

currentClient.on('message', msg => {
    temp = msg.from;
    if (msg.body == 'TEST') {
        msg.reply("SUCCESS");
        console.log(msg.body);

        // let number = (msg.from).toString().split("@")[0];
        // if(!chatData[`${number}`]){
        //     chatData[`${number}`] = {
        //         data:[],
        //         chatId:msg.from
        //     }
        // }

        // chatData[`${number}`].data = [...chatData[`${number}`],msg.body];
    }
});

app.listen(4455,async()=>{
    console.log("SERVER UP");
    currentClient.initialize();
})