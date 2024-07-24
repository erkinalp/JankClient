import {Guild} from "./guild.js";
import {Channel} from "./channel.js";
import {Direct} from "./direct.js";
import {Voice} from "./audio.js";
import {User} from "./user.js";
import {Fullscreen} from "./fullscreen.js";
import {setTheme, Specialuser} from "./login.js";
import { SnowFlake } from "./snowflake.js";
import { Message } from "./message.js";

const wsCodesRetry=new Set([4000,4003,4005,4007,4008,4009]);

class Localuser{
    packets:number;
    token:string;
    userinfo:Specialuser;
    serverurls;
    initialized:boolean;
    info;
    headers:{"Content-type":string,Authorization:string};
    usersettings:Fullscreen;
    userConnections:Fullscreen;
    devPortal:Fullscreen;
    ready;
    guilds:Guild[];
    guildids:Map<string,Guild>;
    user:User;
    status:string;
    channelfocus:Channel;
    lookingguild:Guild;
    guildhtml:Map<string, HTMLDivElement>;
    ws:WebSocket;
    typing:[string,number][];
    wsinterval:NodeJS.Timeout;
    connectionSucceed=0;
    errorBackoff=0;
    constructor(userinfo:Specialuser){
        this.packets=1;
        this.token=userinfo.token;
        this.userinfo=userinfo;
        this.serverurls=this.userinfo.serverurls;
        this.initialized=false;
        this.info=this.serverurls;
        this.headers={"Content-type": "application/json; charset=UTF-8",Authorization:this.userinfo.token};
    }
    gottenReady(ready):void{
        this.usersettings=null;
        this.initialized=true;
        this.ready=ready;
        this.guilds=[];
        this.guildids=new Map();
        this.user=new User(ready.d.user,this);
        this.userinfo.username=this.user.username;
        this.userinfo.pfpsrc=this.user.getpfpsrc();
        this.status=this.ready.d.user_settings.status;
        this.channelfocus=null;
        this.lookingguild=null;
        this.guildhtml=new Map();
        const members={};
        for(const thing of ready.d.merged_members){
            members[thing[0].guild_id]=thing[0];
        }

        for(const thing of ready.d.guilds){
            const temp=new Guild(thing,this,members[thing.id]);
            this.guilds.push(temp);
            this.guildids[temp.id]=temp;
        }
        {
            const temp=new Direct(ready.d.private_channels,this);
            this.guilds.push(temp);
            this.guildids[temp.id]=temp;
        }
        console.log(ready.d.user_guild_settings.entries);


        for(const thing of ready.d.user_guild_settings.entries){
            this.guildids[thing.guild_id].notisetting(thing);
        }

        for(const thing of ready.d.read_state.entries){
            const channel=this.resolveChannelFromID(thing.id);
            if(!channel){continue;}
            const guild=channel.guild;
            if(guild===undefined){
                continue
            }
            const guildid=guild.snowflake;
            this.guildids[guildid.id].channelids[thing.channel_id].readStateInfo(thing);
        }
        this.typing=[];
    }
    outoffocus():void{
        document.getElementById("servers").textContent="";
        document.getElementById("channels").textContent="";
        if(this.channelfocus){
            this.channelfocus.infinite.delete();
        }
        this.lookingguild=null;
        this.channelfocus=null;
    }
    unload():void{
        this.initialized=false;
        clearInterval(this.wsinterval);
        this.outoffocus();
        this.guilds=[];
        this.guildids=new Map();
        this.ws.close(4000)
    }
    async initwebsocket():Promise<void>{
        let returny=null
        const promise=new Promise((res)=>{returny=res});
        this.ws = new WebSocket(this.serverurls.gateway.toString());
        this.ws.addEventListener('open', (event) => {
        console.log('WebSocket connected');
        this.ws.send(JSON.stringify({
            "op": 2,
            "d": {
                "token":this.token,
                "capabilities": 16381,
                "properties": {
                    "browser": "Jank Client",
                    "client_build_number": 0,
                    "release_channel": "Custom",
                    "browser_user_agent": navigator.userAgent
                },
                "compress": false,
                "presence": {
                    "status": "online",
                    "since": new Date().getTime(),
                    "activities": [],
                    "afk": false
                }
            }
        }))
        });

        this.ws.addEventListener('message', (event) => {



            const temp=JSON.parse(event.data);
            console.log(temp)
            if(temp.op==0){
                switch(temp.t){
                    case "MESSAGE_CREATE":
                        if(this.initialized){
                            this.messageCreate(temp);
                        }
                        break;
                    case "MESSAGE_DELETE":
                        console.log(temp.d);
                        SnowFlake.getSnowFlakeFromID(temp.d.id,Message).getObject().deleteEvent();
                        break;
                    case "READY":
                        this.gottenReady(temp);
                        this.genusersettings();
                        returny();
                        break;
                    case "MESSAGE_UPDATE":
                        const message=SnowFlake.getSnowFlakeFromID(temp.d.id,Message).getObject();
                        message.giveData(temp.d);
                        break;
                    case "TYPING_START":
                        if(this.initialized){
                            this.typingStart(temp);
                        }
                        break;
                    case "USER_UPDATE":
                        if(this.initialized){
                            const users=SnowFlake.getSnowFlakeFromID(temp.d.id,User).getObject() as User;
                            console.log(users,temp.d.id)
                            if(users){
                                users.userupdate(temp.d);
                            }
                        }
                        break
                    case "CHANNEL_UPDATE":
                        if(this.initialized){
                            this.updateChannel(temp.d);
                        }
                        break;
                    case "CHANNEL_CREATE":
                        if(this.initialized){
                            this.createChannel(temp.d);
                        }
                        break;
                    case "CHANNEL_DELETE":
                        if(this.initialized){
                            this.delChannel(temp.d);
                        }
                        break;
                    case "GUILD_DELETE":
                    {
                        const guildy=this.guildids[temp.d.id];
                        delete this.guildids[temp.d.id];
                        this.guilds.splice(this.guilds.indexOf(guildy),1);
                        guildy.html.remove();
                        break;
                    }
                    case "GUILD_CREATE":
                    {
                        const guildy=new Guild(temp.d,this,this.user);
                        this.guilds.push(guildy);
                        this.guildids[guildy.id]=guildy;
                        document.getElementById("servers").insertBefore(guildy.generateGuildIcon(),document.getElementById("bottomseparator"));
                    }
                }

            }else if(temp.op===10){
                console.log("heartbeat down")
                this.wsinterval=setInterval(_=>{
                    if (this.connectionSucceed===0) this.connectionSucceed=Date.now()

                    this.ws.send(JSON.stringify({op:1,d:this.packets}))
                },temp.d.heartbeat_interval)
                this.packets=1;
            }else if(temp.op!=11){
                this.packets++
            }


        });

        this.ws.addEventListener("close", event => {
            console.log("WebSocket closed with code " + event.code);
            if (this.wsinterval) clearInterval(this.wsinterval);

            this.unload();
            document.getElementById("loading").classList.remove("doneloading");
            document.getElementById("loading").classList.add("loading");

            if (((event.code>1000 && event.code<1016) || wsCodesRetry.has(event.code))) {
                if (this.connectionSucceed!==0 && Date.now()>this.connectionSucceed+20000) this.errorBackoff=0;
                else this.errorBackoff++;
                this.connectionSucceed=0;

                document.getElementById("load-desc").innerHTML="Unable to connect to the Spacebar server, retrying in <b>" + Math.round(0.2 + (this.errorBackoff*2.8)) + "</b> seconds...";

                setTimeout(() => {
                    document.getElementById("load-desc").textContent="Retrying...";

                    this.initwebsocket().then(() => {
                        this.loaduser();
                        this.init();
                        document.getElementById("loading").classList.add("doneloading");
                        document.getElementById("loading").classList.remove("loading");
                        console.log("done loading");
                    });
                }, 200 + (this.errorBackoff*2800));
            } else document.getElementById("load-desc").textContent="Unable to connect to the Spacebar server. Please try logging out and back in.";
        });

        await promise;
        return;
    }
    resolveChannelFromID(ID:string):Channel{
        let resolve=this.guilds.find(guild => guild.channelids[ID]);
        if(resolve){
            return resolve.channelids[ID];
        }
        return undefined;
    }
    updateChannel(JSON):void{
        SnowFlake.getSnowFlakeFromID(JSON.guild_id,Guild).getObject().updateChannel(JSON);
        if(JSON.guild_id===this.lookingguild.id){
            this.loadGuild(JSON.guild_id);
        }
    }
    createChannel(JSON):void{
        JSON.guild_id??="@me";
        SnowFlake.getSnowFlakeFromID(JSON.guild_id,Guild).getObject().createChannelpac(JSON);
        if(JSON.guild_id===this.lookingguild.id){
            this.loadGuild(JSON.guild_id);
        }
    }
    delChannel(JSON):void{
        JSON.guild_id??="@me";
        this.guildids[JSON.guild_id].delChannel(JSON);

        if(JSON.guild_id===this.lookingguild.snowflake){
            this.loadGuild(JSON.guild_id);
        }
    }
    init():void{
        const location=window.location.href.split("/");
        this.buildservers();
        if(location[3]==="channels"){
            const guild=this.loadGuild(location[4]);
            guild.loadChannel(location[5]);
            this.channelfocus=guild.channelids[location[5]];
        }

    }
    loaduser():void{
        document.getElementById("username").textContent=this.user.username;
        (document.getElementById("userpfp") as HTMLImageElement).src=this.user.getpfpsrc();
        document.getElementById("status").textContent=this.status;
    }
    isAdmin():boolean{
        return this.lookingguild.isAdmin();
    }
    loadGuild(id:string):Guild{
        let guild=this.guildids[id];
        if(!guild){
            guild=this.guildids["@me"];
        }
        if(this.lookingguild){
            this.lookingguild.html.classList.remove("serveropen");
        }
        if(guild.html){
            guild.html.classList.add("serveropen")
        }
        this.lookingguild=guild;
        document.getElementById("serverName").textContent=guild.properties.name;
        //console.log(this.guildids,id)
        document.getElementById("channels").innerHTML="";
        document.getElementById("channels").appendChild(guild.getHTML());
        return guild;
    }
    buildservers():void{
        const serverlist=document.getElementById("servers");//
        const outdiv=document.createElement("div");
        const div=document.createElement("div");

        div.textContent="⌂";
        div.classList.add("home","servericon")
        div["all"]=this.guildids["@me"];
        this.guildids["@me"].html=outdiv;
        const unread=document.createElement("div");
        unread.classList.add("unread");
        outdiv.append(unread);
        outdiv.appendChild(div);

        outdiv.classList.add("servernoti")
        serverlist.append(outdiv);
        div.onclick=function(){
            this["all"].loadGuild();
            this["all"].loadChannel();
        }
        const sentdms=document.createElement("div");
        sentdms.classList.add("sentdms");
        serverlist.append(sentdms);
        sentdms.id="sentdms";

        const br=document.createElement("hr")
        br.classList.add("lightbr");
        serverlist.appendChild(br)
        for(const thing of this.guilds){
            if(thing instanceof Direct){
                (thing as Direct).unreaddms();
                continue;
            }
            const divy=thing.generateGuildIcon();
            serverlist.append(divy);
        }
        {
            const br=document.createElement("hr");
            br.classList.add("lightbr");
            serverlist.appendChild(br);
            br.id="bottomseparator";

            const div=document.createElement("div");
            div.textContent="+";
            div.classList.add("home","servericon")
            serverlist.appendChild(div)
            div.onclick=_=>{
                console.log("clicked :3")
                this.createGuild();
            }

            const guildDiscoveryContainer=document.createElement("div");
            guildDiscoveryContainer.textContent="🧭";
            guildDiscoveryContainer.classList.add("home","servericon");
            serverlist.appendChild(guildDiscoveryContainer);
            guildDiscoveryContainer.addEventListener("click", ()=>{
                this.guildDiscovery();
            });

        }
        this.unreads();
    }
    createGuild(){
        let inviteurl="";
        const error=document.createElement("span");

        const full=new Fullscreen(["tabs",[
            ["Join using invite",[
                "vdiv",
                    ["textbox",
                        "Invite Link/Code",
                        "",
                        function(){
                            console.log(this)
                            inviteurl=this.value;
                        }
                    ],
                    ["html",error]
                    ,
                    ["button",
                        "",
                        "Submit",
                        _=>{
                            let parsed="";
                            if(inviteurl.includes("/")){
                                parsed=inviteurl.split("/")[inviteurl.split("/").length-1]
                            }else{
                                parsed=inviteurl;
                            }
                            fetch(this.info.api.toString()+"/v9/invites/"+parsed,{
                                method:"POST",
                                headers:this.headers,
                            }).then(r=>r.json()).then(_=>{
                                console.log(_);
                                if(_.message){
                                    error.textContent=_.message;
                                }
                            })
                        }
                    ]

            ]],
            ["Create Server",[
                "text","Not currently implemented, sorry"
            ]]
        ]])
        full.show();
    }
    async guildDiscovery() {
        const content=document.createElement("div");
        content.classList.add("guildy");
        content.textContent="Loading...";
        const full=new Fullscreen(["html", content]);
        full.show();

        const res=await fetch(this.info.api.toString()+"/v9/discoverable-guilds?limit=50", {
            headers: this.headers
        });
        const json=await res.json();

        content.innerHTML="";
        const title=document.createElement("h2");
        title.textContent="Guild discovery ("+json.total+" entries)";
        content.appendChild(title);

        const guilds=document.createElement("div");
        guilds.id="discovery-guild-content";

        json.guilds.forEach(guild=>{
            const content=document.createElement("div");
            content.classList.add("discovery-guild");

            if(guild.banner) {
                const banner=document.createElement("img");
                banner.classList.add("banner");
                banner.crossOrigin="anonymous";
                banner.src=this.info.cdn.toString()+"icons/"+guild.id+"/"+guild.banner+".png?size=256";
                banner.alt="";
                content.appendChild(banner);
            }

            const nameContainer=document.createElement("div");
            nameContainer.classList.add("flex");
            const img=document.createElement("img");
            img.classList.add("icon");
            img.crossOrigin="anonymous";
            img.src=this.info.cdn.toString()+(guild.icon ? ("icons/"+guild.id+"/"+guild.icon+".png?size=48") : "embed/avatars/3.png");
            img.alt="";
            nameContainer.appendChild(img);

            const name=document.createElement("h3");
            name.textContent=guild.name;
            nameContainer.appendChild(name);
            content.appendChild(nameContainer);
            const desc=document.createElement("p");
            desc.textContent=guild.description;
            content.appendChild(desc);

            content.addEventListener("click", async ()=>{
                const joinRes=await fetch(this.info.api.toString()+"/v9/guilds/"+guild.id+"/members/@me", {
                    method: "PUT",
                    headers: this.headers
                });
                if(joinRes.ok) full.hide();
            })
            guilds.appendChild(content);
        })
        content.appendChild(guilds);
    }
    messageCreate(messagep):void{
        messagep.d.guild_id??="@me";
        this.guildids[messagep.d.guild_id].channelids[messagep.d.channel_id].messageCreate(messagep);
        this.unreads();
    }
    unreads():void{
        console.log(this.guildhtml)
        for(const thing of this.guilds){
            if(thing.id==="@me"){continue;}
            thing.unreads(this.guildhtml[thing.id]);
        }
    }
    typingStart(typing):void{
        if(this.channelfocus.snowflake===typing.d.channel_id){
            const memb=typing.d.member;
            let name;
            if(memb.id===this.user.snowflake){
                console.log("you is typing")
                return;
            }
            console.log("user is typing and you should see it");
            if(memb.nick){
                name=memb.nick;
            }else{
                name=memb.user.username;
            }
            let already=false;
            for(const thing of this.typing){
                if(thing[0]===name){
                    thing[1]=new Date().getTime();
                    already=true;
                    break;
                }
            }
            if(!already){
                this.typing.push([name,new Date().getTime()]);
            }
            setTimeout(this.rendertyping.bind(this),10000);
            this.rendertyping();
        }
    }
    updatepfp(file:Blob):void{
        var reader = new FileReader();
        reader.readAsDataURL(file);
        console.log(this.headers);
        reader.onload = ()=>{
            fetch(this.info.api.toString()+"/users/@me",{
                method:"PATCH",
                headers:this.headers,
                body:JSON.stringify({
                    avatar:reader.result,
                })
            });
            console.log(reader.result);
        };

    }
    updatepronouns(pronouns:string):void{
        fetch(this.info.api.toString()+"/users/@me/profile",{
            method:"PATCH",
            headers:this.headers,
            body:JSON.stringify({
                pronouns:pronouns,
            })
        });
    }
    updatebio(bio:string):void{
        fetch(this.info.api.toString()+"/v9/users/@me/profile",{
            method:"PATCH",
            headers:this.headers,
            body:JSON.stringify({
                bio:bio,
            })
        });
    }
    rendertyping():void{
        const typingtext=document.getElementById("typing")
        let build="";
        const array2=[];
        let showing=false;
        let i=0;
        for(const thing of this.typing){
            i++;
            if(thing[1]>new Date().getTime()-5000){
                build+=thing[0];
                array2.push(thing);
                showing=true;
                if(i!==this.typing.length){
                    build+=",";
                }
            }
        }
        if(i>1){
            build+=" are typing";
        }else{
            build+=" is typing";
        }
        console.log(typingtext.classList);
        if(showing){
            typingtext.classList.remove("hidden");
            document.getElementById("typingtext").textContent=build;
        }else{
            typingtext.classList.add("hidden");
        }
    }
    genusersettings():void{
        const hypotheticalProfile=document.createElement("div");
        let file=null;
        let newprouns=null;
        let newbio=null;
        let hypouser=new User(this.user,this,true);
        function regen(){
            hypotheticalProfile.textContent="";
            const hypoprofile=hypouser.buildprofile(-1,-1);

            hypotheticalProfile.appendChild(hypoprofile)
        }
        regen();
        this.usersettings=new Fullscreen(
        ["hdiv",
            ["vdiv",
                ["fileupload","upload pfp:",function(e){
                    console.log(this.files[0])
                    file=this.files[0];
                    const blob = URL.createObjectURL(this.files[0]);
                    hypouser.avatar = blob;
                    hypouser.hypotheticalpfp=true;
                    regen();
                }],
                ["textbox","Pronouns:",this.user.pronouns,function(e){
                    console.log(this.value);
                    hypouser.pronouns=this.value;
                    newprouns=this.value;
                    regen();
                }],
                ["mdbox","Bio:",this.user.bio.rawString,function(e){
                    console.log(this.value);
                    hypouser.bio=this.value;
                    newbio=this.value;
                    regen();
                }],
                ["button","update user content:","submit",()=>{
                    if(file!==null){
                        this.updatepfp(file);
                    }
                    if(newprouns!==null){
                        this.updatepronouns(newprouns);
                    }
                    if(newbio!==null){
                        this.updatebio(newbio);
                    }
                }],
                ["select","Theme:",["Dark","Light","WHITE"],e=>{
                    localStorage.setItem("theme",["Dark","Light","WHITE"][e.target.selectedIndex]);
                    setTheme();
                },["Dark","Light","WHITE"].indexOf(localStorage.getItem("theme"))],
                ["select","Notification sound:",Voice.sounds,e=>{
                    Voice.setNotificationSound(Voice.sounds[e.target.selectedIndex]);
                    Voice.noises(Voice.sounds[e.target.selectedIndex]);
                },Voice.sounds.indexOf(Voice.getNotificationSound())]
            ],
            ["vdiv",
                ["html",hypotheticalProfile]
            ]
        ],_=>{},function(){
            console.log(this);
            hypouser=new User(this.user,this);
            regen();
            file=null;
            newprouns=null;
            newbio=null;
        }.bind(this))

        const connectionContainer=document.createElement("div");
        connectionContainer.id="connection-container";
        this.userConnections=new Fullscreen(
            ["html",
                connectionContainer
            ], () => {}, async () => {
                connectionContainer.innerHTML="";

                const res=await fetch(this.info.api.toString()+"/v9/connections", {
                    headers: this.headers
                });
                const json=await res.json();

                Object.keys(json).sort(key => json[key].enabled ? -1 : 1).forEach(key => {
                    const connection=json[key];

                    const container=document.createElement("div");
                    container.textContent=key.charAt(0).toUpperCase() + key.slice(1);

                    if (connection.enabled) {
                        container.addEventListener("click", async () => {
                            const connectionRes=await fetch(this.info.api.toString()+"/v9/connections/" + key + "/authorize", {
                                headers: this.headers
                            });
                            const connectionJSON=await connectionRes.json();
                            window.open(connectionJSON.url, "_blank", "noopener noreferrer");
                        })
                    } else {
                        container.classList.add("disabled")
                        container.title="This connection has been disabled server-side."
                    }

                    connectionContainer.appendChild(container);
                })
            }
        );

        let appName="";
        const appListContainer=document.createElement("div");
        appListContainer.id="app-list-container";
        this.devPortal=new Fullscreen(
            ["vdiv",
                ["hdiv",
                    ["textbox", "Name:", appName, event => {
                        appName=event.target.value;
                    }],
                    ["button",
                        "",
                        "Create application",
                        async () => {
                            if (appName.trim().length == 0) return alert("Please enter a name for the application.");

                            const res=await fetch(this.info.api.toString()+"/v9/applications", {
                                method: "POST",
                                headers: this.headers,
                                body: JSON.stringify({
                                    name: appName
                                })
                            });
                            const json=await res.json();
                            this.manageApplication(json.id);
                            this.devPortal.hide();
                        }
                    ]
                ],
                ["html",
                    appListContainer
                ]
            ], () => {}, async () => {
                appListContainer.innerHTML="";

                const res=await fetch(this.info.api.toString()+"/v9/applications", {
                    headers: this.headers
                });
                const json=await res.json();

                json.forEach(application => {
                    const container=document.createElement("div");

                    if (application.cover_image) {
                        const cover=document.createElement("img");
                        cover.crossOrigin="anonymous";
                        cover.src=this.info.cdn.toString()+"/app-icons/" + application.id + "/" + application.cover_image + ".png?size=256";
                        cover.alt="";
                        cover.loading="lazy";
                        container.appendChild(cover);
                    }

                    const name=document.createElement("h2");
                    name.textContent=application.name + (application.bot ? " (Bot)" : "");
                    container.appendChild(name);

                    container.addEventListener("click", async () => {
                        this.devPortal.hide();
                        this.manageApplication(application.id);
                    });
                    appListContainer.appendChild(container);
                })
            }
        )
    }
    async manageApplication(appId="") {
        const res=await fetch(this.info.api.toString()+"/v9/applications/" + appId, {
            headers: this.headers
        });
        const json=await res.json();

        const fields: any={};
        const appDialog=new Fullscreen(
            ["vdiv",
                ["title",
                    "Editing " + json.name
                ],
                ["vdiv",
                    ["textbox", "Application name:", json.name, event => {
                        fields.name=event.target.value;
                    }],
                    ["mdbox", "Description:", json.description, event => {
                        fields.description=event.target.value;
                    }],
                    ["vdiv",
                        json.icon ? ["img", this.info.cdn.toString()+"/app-icons/" + appId + "/" + json.icon + ".png?size=128", [128, 128]] : ["text", "No icon"],
                        ["fileupload", "Application icon:", event => {
                            const reader=new FileReader();
                            reader.readAsDataURL(event.target.files[0]);
                            reader.onload=() => {
                                fields.icon=reader.result;
                            }
                        }]
                    ]
                ],
                ["hdiv",
                    ["textbox", "Privacy policy URL:", json.privacy_policy_url || "", event => {
                        fields.privacy_policy_url=event.target.value;
                    }],
                    ["textbox", "Terms of Service URL:", json.terms_of_service_url || "", event => {
                        fields.terms_of_service_url=event.target.value;
                    }]
                ],
                ["hdiv",
                    ["checkbox", "Make bot publicly inviteable?", json.bot_public, event => {
                        fields.bot_public=event.target.checked;
                    }],
                    ["checkbox", "Require code grant to invite the bot?", json.bot_require_code_grant, event => {
                        fields.bot_require_code_grant=event.target.checked;
                    }]
                ],
                ["hdiv",
                    ["button",
                        "",
                        "Save changes",
                        async () => {
                            const updateRes=await fetch(this.info.api.toString()+"/v9/applications/" + appId, {
                                method: "PATCH",
                                headers: this.headers,
                                body: JSON.stringify(fields)
                            });
                            if (updateRes.ok) appDialog.hide();
                            else {
                                const updateJSON=await updateRes.json();
                                alert("An error occurred: " + updateJSON.message);
                            }
                        }
                    ],
                    ["button",
                        "",
                        (json.bot ? "Manage" : "Add") + " bot",
                        async () => {
                            if (!json.bot) {
                                if (!confirm("Are you sure you want to add a bot to this application? There's no going back.")) return;

                                const updateRes=await fetch(this.info.api.toString()+"/v9/applications/" + appId + "/bot", {
                                    method: "POST",
                                    headers: this.headers
                                });
                                const updateJSON=await updateRes.json();
                                alert("Bot token:\n" + updateJSON.token);
                            }

                            appDialog.hide();
                            this.manageBot(appId);
                        }
                    ]
                ]
            ]
        )
        appDialog.show();
    }
    async manageBot(appId="") {
        const res=await fetch(this.info.api.toString()+"/v9/applications/" + appId, {
            headers: this.headers
        });
        const json=await res.json();
        if (!json.bot) return alert("For some reason, this application doesn't have a bot (yet).");

        const fields: any={
            username: json.bot.username,
            avatar: json.bot.avatar ? (this.info.cdn.toString()+"/app-icons/" + appId + "/" + json.bot.avatar + ".png?size=256") : ""
        };
        const botDialog=new Fullscreen(
            ["vdiv",
                ["title",
                    "Editing bot: " + json.bot.username
                ],
                ["hdiv",
                    ["textbox", "Bot username:", json.bot.username, event => {
                        fields.username=event.target.value
                    }],
                    ["vdiv",
                        fields.avatar ? ["img", fields.avatar, [128, 128]] : ["text", "No avatar"],
                        ["fileupload", "Bot avatar:", event => {
                            const reader=new FileReader();
                            reader.readAsDataURL(event.target.files[0]);
                            reader.onload=() => {
                                fields.avatar=reader.result;
                            }
                        }]
                    ]
                ],
                ["hdiv",
                    ["button",
                        "",
                        "Save changes",
                        async () => {
                            const updateRes=await fetch(this.info.api.toString()+"/v9/applications/" + appId + "/bot", {
                                method: "PATCH",
                                headers: this.headers,
                                body: JSON.stringify(fields)
                            });
                            if (updateRes.ok) botDialog.hide();
                            else {
                                const updateJSON=await updateRes.json();
                                alert("An error occurred: " + updateJSON.message);
                            }
                        }
                    ],
                    ["button",
                        "",
                        "Reset token",
                        async () => {
                            if (!confirm("Are you sure you want to reset the bot token? Your bot will stop working until you update it.")) return;

                            const updateRes=await fetch(this.info.api.toString()+"/v9/applications/" + appId + "/bot/reset", {
                                method: "POST",
                                headers: this.headers
                            });
                            const updateJSON=await updateRes.json();
                            alert("New token:\n" + updateJSON.token);
                            botDialog.hide();
                        }
                    ]
                ]
            ]
        );
        botDialog.show();
    }
}
export {Localuser};
