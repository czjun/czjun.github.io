var posts=["2025/08/26/刚刚是0-现在是1/","2025/08/26/hello-world/","2025/09/02/plane-的经验之谈/","2025/09/14/图片测试贴/","2025/09/22/在Hexo中如何正确的插入-引用图片/","2025/09/16/有关markdown贴文的编写总结/","2025/09/15/网站建设计划/","2025/08/27/论自我介绍的重要性/","2025/09/09/部署中遇到的问题/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };