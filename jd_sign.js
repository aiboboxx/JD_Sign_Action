// version v0.0.1
// create by zhihua
// detail url: https://github.com/ruicky/jd_sign_bot

const exec = require('child_process').execSync;
const fs = require('fs');
const rp = require('request-promise');
const download = require('download');
const core = require('@actions/core');
const github = require('@actions/github');
const myfuns = require('./myfuns.js');
const mysql = require('mysql2/promise');
const runId = github.context.runId;
let setup;
if (!runId) {
  setup  = JSON.parse(fs.readFileSync('./setup.json', 'utf8'));
}
const pool = mysql.createPool({
  host: runId?process.env.MYSQL_HOST:setup.mysql.host,
  user: runId?process.env.MYSQL_USER:setup.mysql.user,
  password : runId?process.env.MYSQL_PASSWORD:setup.mysql.password,   
  port: runId?process.env.MYSQL_PORT:setup.mysql.port,  
  database: runId?process.env.MYSQL_DATABASE:setup.mysql.database,
  waitForConnections: true, //连接超额是否等待
  connectionLimit: 10, //一次创建的最大连接数
  queueLimit: 0 //可以等待的连接的个数
});
//console.log(runId?process.env.MYSQL_HOST:setup.mysql.host,runId?process.env.MYSQL_PASSWORD:setup.mysql.password);
//return;
Date.prototype.Format = function (fmt) {
  var o = {
    'M+': this.getMonth() + 1,
    'd+': this.getDate(),
    'H+': this.getHours(),
    'm+': this.getMinutes(),
    's+': this.getSeconds(),
    'S+': this.getMilliseconds()
  };
  if (/(y+)/.test(fmt)) {
    fmt = fmt.replace(RegExp.$1, (this.getFullYear() + '').substr(4 - RegExp.$1.length));
  }
  for (var k in o) {
    if (new RegExp('(' + k + ')').test(fmt)) {
      fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (('00' + o[k]).substr(String(o[k]).length)));
    }
  }
  return fmt;
};
// 京东脚本文件
const js_url = 'https://raw.githubusercontent.com/NobyDa/Script/master/JD-DailyBonus/JD_DailyBonus.js';
// 下载脚本路劲
const js_path = './JD_DailyBonus.js';
function setupCookie(cookie) {
  let js_content = fs.readFileSync('./JD_DailyBonus.js', 'utf8')
  js_content = js_content.replace(/var Key = '.*'/, `var Key = '${cookie}'`)
  fs.writeFileSync('./JD_DailyBonus.js', js_content, 'utf8')
}

function sendNotificationIfNeed(push_key) {
  if (!push_key) {
    console.log('执行任务结束!'); return;
  }

  if (!fs.existsSync('./result.txt')) {
    console.log('没有执行结果，任务中断!'); return;
  }

  let text = "京东签到_" + new Date().Format('yyyy.MM.dd');
  let desp = fs.readFileSync('./result.txt', "utf8")

  // 去除末尾的换行
  let SCKEY = push_key.replace(/[\r\n]/g,"")

  const options ={
    uri:  `https://sc.ftqq.com/${SCKEY}.send`,
    form: { text, desp },
    json: true,
    method: 'POST'
  }

  rp.post(options).then(res=>{
    const code = res['errno'];
    if (code == 0) {
      console.log("通知发送成功，任务结束！")
    }
    else {
      console.log(res);
      console.log("通知发送失败，任务中断！")
      fs.writeFileSync('./error.txt', JSON.stringify(res), 'utf8')
    }
  }).catch((err)=>{
    console.log("通知发送失败，任务中断！")
    fs.writeFileSync('./error.txt', err, 'utf8')
  })
}

async function main() {
        // 1、下载脚本
        download(js_url, './');
  console.log(`*****************开始京东签到 ${Date()}*******************\n`);  
  //let sql = "SELECT * FROM jdsign WHERE id=13 and endtime > NOW() ORDER BY update_time ASC limit 3;"

    let sql = 
  `SELECT
    *
  FROM
    jdsign 
  WHERE
    invalid IS NULL 
    AND ( TO_DAYS( NOW()) > TO_DAYS( update_time ) OR update_time IS NULL )  
  ORDER BY
    update_time ASC 
    LIMIT 100`; 
  let r =  await pool.query(sql);
  let i = 0;
  console.log(`共有${r[0].length}个账户要签到`);
  for (let row of r[0]) {
    i++;
    console.log("email:",i, row.email);
    if (i % 3 == 0) await myfuns.Sleep(1000).then(()=>console.log('暂停1秒！'));
    if (row.cookies) {
      await jdsign(row);
      let sql,arr;   
      sql = 'UPDATE `jdsign` SET  `update_time` = NOW() WHERE `id` = ?';
      arr = [row.id];
      sql = await pool.format(sql,arr);
      //console.log(sql);
      await pool.query(sql)
      .then((reslut)=>{console.log('changedRows',reslut[0].changedRows);myfuns.Sleep(10000);})
      .catch((error)=>{console.log('UPDATEerror: ', error.message);myfuns.Sleep(10000);});
    }
  }
  await pool.end();
  //if ( runId?true:false ) await browser.close();
}
async function jdsign(row){
  let ck='',cookies=[];
  if (isJsonString(row.cookies)){
    cookies = JSON.parse(row.cookies);
    ck = toStringCookies(cookies);
  }else{
    //cookies = toArrayCookies(row.cookies,'.jd.com');
    ck = row.cookies;
  }
   //return row;
    // 2、替换cookie
    setupCookie(ck);
    //return row;
    // 3、执行脚本
    exec(`node JD_DailyBonus.js > result.txt`);
      // 4、发送推送
    sendNotificationIfNeed(row.pushkey);
    fs.unlinkSync('./CookieSet.json');
    fs.unlinkSync('./result.txt');
    return row; 
}
const toArrayCookies =  (cookies_str,domain) => { 
  let cookies = cookies_str.split(';').map( pair => { 
    let name = pair.trim().slice(0, pair.trim().indexOf('=')); 
    let value = pair.trim().slice(pair.trim().indexOf('=') + 1); 
    return {name, value, domain} 
  }); 
  return cookies;
};

const toStringCookies =  (cookies) => { 
  let ck = cookies.map(pair => { 
    let {name,value} = pair; 
    return name+'='+value; 
  }); 
  //console.log(ck);
  return ck.join(';');
};
function isJsonString(str) {
  try {
      if (typeof JSON.parse(str) == "object") {
          return true;
      }
  } catch(e) {
  }
  return false;
}
main();