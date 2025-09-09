var posts=["2025/08/26/hello-world/","2025/09/02/plane-的经验之谈/","2025/08/27/论自我介绍的重要性/","2025/08/26/刚刚是0-现在是1/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };