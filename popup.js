document.addEventListener('DOMContentLoaded', async function() {
  let getDiffButton = document.getElementById('getDiff');
  getDiffButton.addEventListener('click', async (e) => {
    e.preventDefault();

    await getDiff();
  });

  let getFollowersButton = document.getElementById('getFollowers');
  getFollowersButton.addEventListener('click', async (e) => {
    e.preventDefault();

    await getFollowers();
  });

  let getFollowingsButton = document.getElementById('getFollowings');
  getFollowingsButton.addEventListener('click', async (e) => {
    e.preventDefault();

    await getFollowings();
  });

  }, false);

async function getDiff() {
  alert(`Get Diff called!`);

  await getCookies('https://www.insta-diff-exporter.app', 'insta-diff-export-running', async (cookie) => {
    if (cookie === "true") {
      return alert(`Job already running. Please wait...`);
    }
    await setCookies("insta-diff-export-running", "true", async (cookie) => {
      if (!cookie) {
        return alert(`Job cannot be executed!`);
      }

      await findDiff();
    });
  });
}

async function getFollowers() {
  alert(`Get Followers called!`);

  await getCookies('https://www.insta-diff-exporter.app', 'insta-diff-export-running', async (cookie) => {
    if (cookie === "true") {
      return alert(`Job already running. Please wait...`);
    }
    await setCookies("insta-diff-export-running", "true", async (cookie) => {
      if (!cookie) {
        return alert(`Job cannot be executed!`);
      }

      await getList('follower');
    });
  });
}

async function getFollowings() {
  alert(`Get Followings called!`);

  await getCookies('https://www.insta-diff-exporter.app', 'insta-diff-export-running', async (cookie) => {
    if (cookie === "true") {
      return alert(`Job already running. Please wait...`);
    }

    await setCookies("insta-diff-export-running", "true", async (cookie) => {
      if (!cookie) {
        return alert(`Job cannot be executed!`);
      }

      await getList('following');
    });
  });
}

async function getCookies(domain, name, callback) {
  chrome.cookies.get({"url": domain, "name": name}, async (cookie) => {
    if(callback) {
      await callback(cookie?.value);
    }
  });
}

async function setCookies(name, value, callback) {
  chrome.cookies.set({"url": "https://www.insta-diff-exporter.app", name, value}, async (cookie) => {
    if (!cookie) {
      alert(`Failed to set config cookie.`);
    }

    if(callback) {
      await callback(cookie);
    }
  });
}

// mathematically generate a wait time between 0.1 and 0.5 seconds, to prevent ratelimiting
const random_wait_time = (waitTime = 400) => new Promise((resolve, reject) => {
  setTimeout(() => {
    return resolve();
  }, (Math.random() * waitTime + 100));
});

const ratelimit = () => new Promise((resolve, reject) => {
  setTimeout(() => {
    return resolve();
  }, 60000);
});

// get follower/following list.
// the first argument is type of list to fetch, either "follower" or "following".
// the second argument is whether to NOT log the results, which is for the latter findDiff function, default "false". normal users shouldn't set this to "true"
const getList = async (type, nolog, callback) => {
  await getCookies('https://www.instagram.com', 'ds_user_id', async (userId) => {
    if (!userId) {
      alert(`You're not logged in on Instagram. Please open Instagram website and log in!`);

      return window.open(`https://www.instagram.com`);
    }

    let typeOfFollower = (type === "follower") ? 1 : ((type === "following") ? 0 : undefined); // convert first one to true/false for convenience
    if (typeOfFollower === undefined) throw "first argument must be \"follower\" or \"following\"."; // catch typos

    const batchCount = 12; // fetch 12 in 1 request, same as the web interface
    const hash = typeOfFollower ? "c76146de99bb02f6415203be841dd25a" : "d04b0a864b4b54837c0d870b0e77e076"; // hash, apparently these two are constant values, but instagram might change them
    const mutual = typeOfFollower ? "true" : "false"; // followers or following?
    const variable = typeOfFollower ? "edge_followed_by" : "edge_follow"; // followers or following? part 2

    let url = `https://www.instagram.com/graphql/query/?query_hash=${hash}&variables={"id":"${userId}","include_reel":true,"fetch_mutual":${mutual},"first":${batchCount}}`; // set up the url
    let userFollowers = []; // set up list of followers
    let running = true; // is it fetching users?

    while (running) { // if there's users left to fetch
      const followersResponse = await fetch(url) // ping url
        .then(res => res.json()) // parse json body
        .then(res => {
          const nodeIds = [];
          for (const node of res.data.user[variable].edges) {
            nodeIds.push(node.node.username); // for each user object, find username and put them in the list
          }
          return {
            edges: nodeIds, // list of users
            endCursor: res.data.user[variable].page_info.end_cursor // instagram doesn't allow fetching a lot of users at once, so it needs to know where to start the next fetching
          };
        }).catch(async err => { // if this broke, show error
          console.log(err);
          if (url.split(`,"after":`)[1].split(`"}"`)[0] === "undefined" || url.split(`,"after":`)[1].split(`"}"`)[0] === "null") {
            return {
              edges: []
            }
          }
          else {
            console.log("Seems like I hit a 429, will wait 60 seconds (The process is still running, don't close the tab!)");
            await ratelimit();
            return {
              edges: [],
              endCursor: url.split(`,"after":"`)[1].split(`"}`)[0]
            };
          }
        });

      await random_wait_time(); // wait

      userFollowers = [...userFollowers, ...followersResponse.edges]; // append the newly-acquired list to the old list

      if (followersResponse.endCursor === null) running = false; // if no more users, stop fetching them

      url = `https://www.instagram.com/graphql/query/?query_hash=${hash}&variables={"id":"${userId}","include_reel":true,"fetch_mutual":${mutual},"first":${batchCount},"after":"${followersResponse.endCursor}"}`; // remake url
    }
    if (!nolog) {
      console.log(`========= ${type.toUpperCase()} =========\n` + userFollowers.join("\n"));
    }

    return await setCookies("insta-diff-export-running", "false", async (cookie) => {
      if (!cookie) {
        alert(`Job cannot be finished!`);
      }

      // show
      if (callback && typeof callback === "function") {
        callback(userFollowers);
      }

      return userFollowers;
    });
  });
};

const findDiff = async () => {
  await getList("follower", true, async (a) => {
    await getList("following", true, async (b) => {
      const c = b.filter(u => a.indexOf(u) === -1); // for each followings, if not follower, then push to list

      console.log(`========= Following, not followed =========\n` + c.join("\n")) // show

      return c;
    });
  });
}
