class localuser{
    constructor(ready){
        this.ready=ready;
        this.guilds=[];
        this.guildids={};
        this.user=new user(ready.d.user);
        this.status=this.ready.d.user_settings.status;
        this.channelfocus=null;
        this.lookingguild=null;
        this.guildhtml={};
        for(const thing of ready.d.guilds){
            const temp=new guild(thing,this);
            this.guilds.push(temp);
            this.guildids[temp.id]=temp;
        }
        {
            const temp=new dirrect(ready.d.private_channels,this);
            this.guilds.push(temp);
            this.guildids[temp.id]=temp;
        }
        for(const thing of ready.d.merged_members){
            const temp=new member(thing[0]);
            this.guildids[temp.guild_id].giveMember(temp);
        }
        for(const thing of ready.d.read_state.entries){
            console.log(thing)
            const guild=this.resolveGuildidFromChannelID(thing.id)
            if(guild===undefined){
                continue
            }
            const guildid=guild.id;
            this.guildids[guildid].channelids[thing.channel_id].readStateInfo(thing);
        }
        this.typing=[];
    }
    resolveGuildidFromChannelID(ID){
        let resolve=this.guilds.find(guild => guild.channelids[ID])
        resolve??=undefined;
        return resolve;
    }
    updateChannel(JSON){
        this.guildids[JSON.guild_id].updateChannel(JSON);
        if(JSON.guild_id===this.lookingguild.id){
            this.loadGuild(JSON.guild_id);
        }
    }
    createChannel(JSON){
        JSON.guild_id??="@me";
        this.guildids[JSON.guild_id].createChannelpac(JSON);
        if(JSON.guild_id===this.lookingguild.id){
            this.loadGuild(JSON.guild_id);
        }
    }
    delChannel(JSON){
        JSON.guild_id??="@me";
        this.guildids[JSON.guild_id].delChannel(JSON);
        if(JSON.guild_id===this.lookingguild.id){
            this.loadGuild(JSON.guild_id);
        }
    }
    init(){
        const location=window.location.href.split("/");
        if(location[3]==="channels"){
            const guild=this.loadGuild(location[4]);
            console.log(guild);
            guild.loadChannel(location[5]);
            console.log(location[5])
            this.channelfocus=location[5];
        }
        this.buildservers();
    }
    loaduser(){
        document.getElementById("username").innerText=this.user.username
        document.getElementById("userpfp").src=this.user.getpfpsrc()
        document.getElementById("status").innerText=this.status;
    }
    isAdmin(){
        return this.lookingguild.isAdmin();
    }
    loadGuild(id){
        const guild=this.guildids[id];
        this.lookingguild=guild;
        document.getElementById("serverName").innerText=guild.properties.name;
        //console.log(this.guildids,id)
        document.getElementById("channels").innerHTML="";
        document.getElementById("channels").appendChild(guild.getHTML());
        return guild;
    }
    buildservers(){
        const serverlist=document.getElementById("servers");//

        const div=document.createElement("div");
        div.innerText="⌂";
        div.classList.add("Home","servericon")
        div.all=this.guildids["@me"];
        serverlist.appendChild(div)
        div.onclick=function(){
            this.all.loadGuild();
            this.all.loadChannel();
        }
        const sentdms=document.createElement("div");
        sentdms.classList.add("sentdms");
        serverlist.append(sentdms);
        sentdms.id="sentdms";

        const br=document.createElement("hr")
        br.classList.add("lightbr");
        serverlist.appendChild(br)
        for(const thing of this.guilds){
            if(thing instanceof dirrect){
                thing.unreaddms();
                continue;
            }
            const divy=document.createElement("div");
            divy.classList.add("servernoti");

            const noti=document.createElement("div");
            noti.classList.add("unread");
            divy.append(noti);
            this.guildhtml[thing.id]=divy;
            if(thing.properties.icon!=null){
                const img=document.createElement("img");
                img.classList.add("pfp","servericon")
                img.src="https://cdn.old.server.spacebar.chat/icons/"+thing.properties.id+"/"+thing.properties.icon+".png";
                divy.appendChild(img)
                img.all=thing;
                img.onclick=function(){
                    console.log(this.all.loadGuild)
                    this.all.loadGuild();
                    this.all.loadChannel();
                }
            }else{
                const div=document.createElement("div");
                let build="";
                for(const char of thing.properties.name.split(" ")){
                    build+=char[0];
                }
                div.innerText=build;
                div.classList.add("blankserver","servericon")
                divy.appendChild(div)
                div.all=thing;
                div.onclick=function(){
                    this.all.loadGuild();
                    this.all.loadChannel();
                }
            }
            serverlist.append(divy);
        }
        this.unreads();
    }
    messageCreate(messagep){
        messagep.d.guild_id??="@me";
        this.guildids[messagep.d.guild_id].channelids[messagep.d.channel_id].messageCreate(messagep,this.channelfocus===messagep.d.channel_id);
        this.unreads();
    }
    unreads(){
        console.log(this.guildhtml)
        for(const thing of this.guilds){
            if(thing.id==="@me"){continue;}
            thing.unreads(this.guildhtml[thing.id]);
        }
    }
    typeingStart(typing){
        if(this.channelfocus===typing.d.channel_id){
            const memb=typing.d.member;
            let name;
            if(memb.id===this.user.id){
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
    updatepfp(file){
        var reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function () {
            fetch("https://old.server.spacebar.chat/api/v9/users/@me",{
                method:"PATCH",
                headers:{
                    "Content-type": "application/json; charset=UTF-8",
                    Authorization:token
                },
                body:JSON.stringify({
                    avatar:reader.result,
                })
            });
            console.log(reader.result);
        };

    }
    updatepronouns(pronouns){
        fetch("https://old.server.spacebar.chat/api/v9/users/@me/profile",{
            method:"PATCH",
            headers:{
                "Content-type": "application/json; charset=UTF-8",
                Authorization:token
            },
            body:JSON.stringify({
                pronouns:pronouns,
            })
        });
    }
    updatebio(bio){
        fetch("https://old.server.spacebar.chat/api/v9/users/@me/profile",{
            method:"PATCH",
            headers:{
                "Content-type": "application/json; charset=UTF-8",
                Authorization:token
            },
            body:JSON.stringify({
                bio:bio,
            })
        });
    }
    rendertyping(){
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
            document.getElementById("typingtext").innerText=build;
        }else{
            typingtext.classList.add("hidden");
        }
    }

}
