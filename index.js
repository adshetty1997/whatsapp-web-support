const { Client, LocalAuth, MessageMedia, Buttons, List } = require('whatsapp-web.js');
const app = require("express")();
const bodyParser = require('body-parser');
const fs = require("fs");
const fileUpload = require('express-fileupload');

const qrTime = 16;
const maxSessions = 20;
let qrTimer = 0;
let clientCounter = 0;
let qr = "";
let activeSessions = {};
let intervalFunction = undefined;

///APIS

app.use(bodyParser.json());

app.use(
    fileUpload({
        limits: {
            fileSize: 50000000, //~50MB
        },
        abortOnLimit: true,
    })
);

app.get("/:sender/login",async(req,res)=>{
    try{
        let sender = req.params.sender;
        if(!!!sender){
            throw Error("Missing login number.");
        }
        
        if((Object.keys(activeSessions)).length===maxSessions){
            throw Error("User limit reached.");
        }
        else if(activeSessions[`${sender}`]){
            throw Error("User already logged in.");
        }
        else if(!!!qr){
            throw Error("QR not available. Try again later.");
        }

        res.status(201).send({qr:qr, expiresInSeconds:qrTimer});
    }
    catch(error){
        res.status(400).send({message:error.message});
    }
});

app.get("/:sender/logout",async(req,res)=>{
    try{
        let sender = req.params.sender;
        if(!!!sender){
            throw Error("Missing login number.");
        }
        
        let activeSession = activeSessions[`${sender}`]
        if(!activeSession){
            throw Error("User not logged in.");
        }

        activeSession.logout();
        res.status(201).send({message:"OK"});
    }
    catch(error){
        res.status(400).send({message:error.message});
    }
});

app.post("/:sender/update-profile-pic",async(req,res)=>{
    try{
        let sender = req.params.sender;
        const { image } = req.files;
        
        if(!!!sender){
            throw Error("Missing login number.");
        }
        
        let activeSession = activeSessions[`${sender}`]

        if(!activeSession){
            throw Error("User not logged in.");
        }
        else if(!image || !(image.mimetype).match(/image/)){
            throw Error("No Image file received or invalid file type.");
        }

        let path = './uploads/' + image.name;
        image.mv(path);
        
        setTimeout(async()=>{
            let response = await activeSession.setProfilePicture(MessageMedia.fromFilePath(path));
            fs.unlinkSync(path);
            res.status(201).send({message:"Profile pic updated."});
        },1500);
    }
    catch(error){
        res.status(400).send({message:error.message});
    }
});

app.get("/:sender/get-messages/:receiver/:count?",async(req,res)=>{
    try{
        let sender = req.params.sender

        if(!!!sender){
            throw Error("Missing login number.");
        }
        
        let activeSession = activeSessions[`${sender}`]

        if(!activeSession){
            throw Error("User not logged in.");
        }

        let receiverNumber = req.params.receiver;
        let limit = req.params.count || 5;
        if(!!!receiverNumber){
            throw Error("Chat contact number not provided.");
        }

        let chat = await activeSession.getChatById(receiverNumber+"@c.us");
        let messages = await chat.fetchMessages({limit:limit});
        let response = messages.map(x=>{
            let temp = messages.find(y=>y.id.id == x._data.quotedStanzaID);
            temp = temp?temp.body:"";
            return {body:x.body,quotedMessage:temp,from:x.from};
        });

        res.status(201).send({messages:[...response]});
    }
    catch(error){
        res.status(400).send({message:error.message});
    }
});

app.post("/:sender/send-message",async(req,res)=>{
    try{
        let sender = req.params.sender

        if(!!!sender){
            throw Error("Missing login number.");
        }
        
        let activeSession = activeSessions[`${sender}`]
        
        if(!activeSession){
            throw Error("User not logged in.");
        }

        let {receiver,message} = req.body;

        if(!!!receiver || !!!message){
            throw Error("Missing contact number or message.");
        }

        let chatId = receiver.toString()+"@c.us";

        activeSession.sendMessage(chatId, message);

        res.status(201).send({message:"Sent"});
    }
    catch(error){
        res.status(400).send({message:error.message});
    }
});

app.post("/:sender/send-caption-image",async(req,res)=>{
    try{
        let sender = req.params.sender

        if(!!!sender){
            throw Error("Missing login number.");
        }
        
        let activeSession = activeSessions[`${sender}`]
        
        if(!activeSession){
            throw Error("User not logged in.");
        }

        let {receiver,caption} = req.body;
        const { image } = req.files;

        if(!!!receiver || !!!caption){
            throw Error("Missing contact number or caption.");
        }
        else if(!image || !(image.mimetype).match(/image/)){
            throw Error("No Image file received or invalid file type.");
        }

        let path = './uploads/' + image.name;
        image.mv(path);

        let chatId = receiver.toString()+"@c.us";

        setTimeout(async()=>{
            await sendImageCaptionMessage(activeSession,chatId,path,caption);
            fs.unlinkSync(path);
            res.status(201).send({message:"Sent"});
        },1500);
    }
    catch(error){
        res.status(400).send({message:error.message});
    }
});


//WHATSAPP-WEB SOCKET

let currentClient;

const initWhatsapp = () => {
    currentClient = new Client({
        authStrategy:new LocalAuth(
            {
                clientId: `CLIENT_${clientCounter++}`,
            }
        ),
        puppeteer:{
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        },
    });
    
    currentClient.on('qr', (qrcode) => {
        console.log('QR RECEIVED', qrcode);
        qr = qrcode;
        startQRTimer();
    });
    
    currentClient.on('ready', async() => {
        console.log('Client is ready!');
        if(intervalFunction){
            clearInterval(intervalFunction);
        }
        qr="";
        let key = currentClient.info.me.user;
        if(activeSessions[`${key}`]){
            activeSessions[`${key}`]
            currentClient.logout();
        }
        activeSessions[`${key}`] = currentClient;
        let activeSessionCount = (Object.keys(activeSessions)).length;
        if(activeSessionCount < maxSessions){
            initWhatsapp();
        }
    });

    currentClient.on('disconnected', () => {
        console.log('Client disconnected!');
        let key = currentClient.info.me.user;
        activeSessions[`${key}`] = undefined;
    });

    currentClient.initialize();
}

app.listen(4455,async()=>{
    console.log("SERVER UP");
    initWhatsapp();
})

const sendImageCaptionMessage = async(client,receiver,imagePath,caption) => {
    let resp = await client.sendMessage(
        receiver, 
        MessageMedia.fromFilePath(imagePath),
        {
            linkPreview:false,
            caption:caption,
        }
        );//image
    return resp;
}

const sendListMessage = async(client,receiver,body,buttonText,sections,title=undefined,footer=undefined) => {
    return await client.sendMessage(receiver, new List(
        body,
        buttonText,
        sections,
        // [
        //     {
        //         title:"section1",
        //         rows:[
        //             {
        //                 id: "1",
        //                 title:"title",
        //                 description:"description"
        //             },
        //             {
        //                 id: "2",
        //                 title:"title",
        //                 description:"description"
        //             }
        //         ],
        //     },
        //     {
        //         title:"section2",
        //         rows:[
        //             {
        //                 id: "3",
        //                 title:"title",
        //                 description:"description"
        //             },
        //             {
        //                 id: "4",
        //                 title:"title",
        //                 description:"description"
        //             }
        //         ],
        //     }
        // ],
        title?title:null,
        footer?footer:null
    ));//list
}

const sendButtonMessage = async(client,receiver,body,buttonArray,title=undefined,footer=undefined) => {
    return await client.sendMessage(receiver, new Buttons(
        body,
        buttonArray,
        // [
        //     {
        //         body:"Button 1",
        //     },
        // ],
        title?title:null,
        footer?footer:null
        ));//buttons
}

const startQRTimer = () => {
    intervalFunction = undefined;
    qrTimer = qrTime;

    intervalFunction = setInterval(()=>{
        if(qrTimer<=1 && intervalFunction){
            clearInterval(intervalFunction);
        }
        else{
            qrTimer--;
        }
    },1000);
}