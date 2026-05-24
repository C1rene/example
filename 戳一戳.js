// by 癫癫博士
// 实现自定义戳一戳交互功能，支持返回文字图片语音禁言，其中语音需配置ffmpeg
// 希望大家喜欢^^
//本人没有测试群，不过其他大佬有（比如渔火佬仓库里的其他作者），可以去看看，我也在里面快乐水群^^
//有idea/有提议/发现bug的话可以通过gitee评论或者私聊联系我~
//项目gitee地址：https://gitee.com/huangshx2001/yunzai-js-plug-in
//欢迎来找找其他有趣的项目或者来点个star~

//阿露改动：将语音从接口获取改为本地发送


import plugin from'../../lib/plugins/plugin.js'
import cfg from'../../lib/config/config.js'
import common from'../../lib/common/common.js'
const path=process.cwd()


//在这里设置事件概率,请保证概率加起来小于1，少于1的部分会触发反击
let reply_text = 0.30 //文字回复概率
let reply_img = 0.60 //图片回复概率
let reply_voice = 0 //语音回复概率
let mutepick = 0 //禁言概率
let example = 0 //拍一拍表情概率
let 图文概率= 0 //图片加文字概率
//剩下的0.10概率就是反击


//定义图片存放路径 默认是Yunzai-Bot/resources/chuochuo
const chuo_path=path+'/resources/chuochuo/';

//定义语音存放路径 默认是Yunzai-Bot/resources/chuochuo2
const chuo_path2=path+'/resources/chuochuo2/'

//图片需要从1开始用数字命名并且保存为jpg或者gif格式，存在Yunzai-Bot/resources/chuochuo目录下
let jpg_number = 78 //输入jpg图片数量
let gif_number = 17 //输入gif图片数量

//语音与图片同理，需要将语音从1开始用数字命名并且保存为wav格式，存在Yunzai-Bot/resources/chuochuo2目录下
let wav_number = 0 //输入wav音频数量


//回复文字列表
let word_list=['戳一次保底一次，嘻嘻',
'痛QAQ...',
'不要戳戳…',
'开拓者，你王棋绝境能0t过吗？',
'快带我去玩！（打滚）',
'哇，你这个人！',
'我真的是栓Q',
'(◦`~´◦)你个老六',
'【保底克拉拉概率+10%】',
'是哪个笨蛋在戳我？',
'奖励你一袋奇巧零食',
'干点正事吧！',
'这破群我是一点也待不下去了！',
'可恶！',
'囊哒哟~',
'你个坏蛋~',
'过分分！',
'呜哇！我要给你起个难听的绰号！',
'（昔涟拿走了开拓者仓库里的一把五星光锥）',
'【强化遗器时小防御拉满】',
'【强化遗器时小生命拉满】',
'吃我一拳！',
'哒咩，别戳了！',
'再戳我就叫主人来揍你啦！',
'你欺负我！',
'充电的时候不可以戳啊，万一漏电了怎么办？',
'QAQ呜哇啊啊啊啊啊！',
'【开拓者命之座-1】',
'【开拓者保底次数+1】',
'【星轨专票-10】',
'【信用点-300w】',
'【星琼-1600】',
'（昔涟偷偷拿走了你3000w信用点，买了橡木蛋糕卷）',
'（昔涟想要拿走你的星琼，但失败了...）',
'（昔涟拿走了你背包里10个星轨专票）',
'QAQ..这个人欺负我…',
'呜呜，要变笨啦！',
'呜呜呜...你还戳QAQ',
'再戳哭给你看！',
'只给你戳一小会儿~',
'虽然戳不坏，但我也是有脾气哒！',
'别戳了别戳了＞＜',
'QAQ',
'你怎么又戳我，气气！',
'昔涟咬洗你',
'是不是要本昔涟要揍你一顿才开心啊！！！',
'坏人，你对昔涟干嘛呢!',
'你个大坏蛋就知道欺负昔涟',
'这个仇我记下了',
'再戳就坏啦！',
'要戳坏掉了>_<，呜呜呜',
'不可以戳戳哦，变态变态变态，哒咩哟～',
'不可以，不可以，不可以！戳疼了！',
'你个大坏蛋就知道欺负昔涟',
'可恶，该死的咸猪手',
'被戳晕了……轻一点啦！',
];


export class chuo extends plugin{
    constructor(){
    super({
        name: '戳一戳',
        dsc: '戳一戳机器人触发效果',
        event: 'notice.group.poke',
        priority: 50,
        rule: [
            {
                /** 命令正则匹配 */
                fnc: 'chuoyichuo'
                }
            ]
        }
    )
}


async chuoyichuo (e){
    logger.info('[戳一戳生效]')
    if(e.target_id == cfg.qq){
        //生成0-100的随机数
        let random_type = Math.random()
        
        //回复随机文字
        if(random_type < reply_text){
            let text_number = Math.ceil(Math.random() * word_list['length'])
            await e.reply(word_list[text_number-1])
        }
        
        
        //回复随机图片
        else if(random_type < (reply_text + reply_img)){

            let photo_number = Math.ceil(Math.random() * (jpg_number + gif_number))
            
            if(photo_number<=jpg_number){
                e.reply(segment.image('file:///' + path + '/resources/chuochuo/'+ photo_number + '.jpg'))
            }
            else{
                photo_number = photo_number - jpg_number
                e.reply(segment.image('file:///' + path + '/resources/chuochuo/'+ photo_number + '.gif'))
            }

        }
        
        //回复随机语音
        else if(random_type < (reply_text + reply_img + reply_voice)){
            
            let voice_number = Math.ceil(Math.random() * (wav_number))
            
            if(voice_number<=wav_number){
                e.reply(segment.record('file:///' + path + '/resources/chuochuo2/'+ voice_number + '.wav'))
        }
        }
        //禁言
        else if(random_type < (reply_text + reply_img + reply_voice + mutepick)){
            //两种禁言方式，随机选一种
            let mutetype = Math.ceil(Math.random() * 2)
            if(mutetype == 1){
                e.reply('说了不要戳了！')
                await common.sleep(1000)
                await e.group.muteMember(e.operator_id,60);
                await common.sleep(3000)
                e.reply('啧')
                //有这个路径的图话可以加上
                //await e.reply(segment.image('file:///' + path + '/resources/chuochuo/'+'laugh.jpg'))
            }
            else if (mutetype == 2){
                e.reply('不！！')
                await common.sleep(300);
                e.reply('准！！')
                await common.sleep(500);
                e.reply('戳！！')
                await common.sleep(700);
                e.reply('爱！！')
                await common.sleep(900);
                e.reply('莉！！')
                await common.sleep(1100);
                await e.group.muteMember(e.operator_id,60)
            }
        }
        
        //拍一拍表情包
        else if(random_type < (reply_text + reply_img + reply_voice + mutepick + example)){
            await e.reply(await segment.image(`http://ovooa.com/API/face_pat/?QQ=${e.operator_id}`))
        }
        
        //回复文字加图片
        else if(random_type < (reply_text + reply_img + reply_voice + mutepick + example+图文概率)){
            let text_number = Math.ceil(Math.random() * word_list['length'])
            let photo_number = Math.ceil(Math.random() * (jpg_number + gif_number))
            
            if(photo_number<=jpg_number){
                await e.reply(word_list[text_number-1])
                e.reply(segment.image('file:///' + path + '/resources/chuochuo/'+ photo_number + '.jpg'))
            }
            else{
                photo_number = photo_number - jpg_number
                await e.reply(word_list[text_number-1])
                e.reply(segment.image('file:///' + path + '/resources/chuochuo/'+ photo_number + '.gif'))
            }

        }
        
        //反击
        else {
            let photo_number = Math.ceil(Math.random() * (jpg_number + gif_number))
            await e.reply('反击！')

            await common.sleep(500)
            if(photo_number<=jpg_number){
                await e.reply(segment.image('file:///' + path + '/resources/chuochuo/'+ photo_number + '.jpg'))
            }
            else{
                photo_number = photo_number - jpg_number
                await e.reply(segment.image('file:///' + path + '/resources/chuochuo/'+ photo_number + '.gif'))
            }
            await common.sleep(500)
            await e.group.pokeMember(e.operator_id)
        }
        
    }
    
}
    
}
