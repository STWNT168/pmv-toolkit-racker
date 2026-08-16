/* Load after api.js */
Api.getOwnTodayRecord = Api.getOwnTodayRecord || (session => Api.request("getOwnTodayRecord",{session}));
Api.deleteOwnTodayRecord = Api.deleteOwnTodayRecord || ((session,recordId)=>Api.request("deleteOwnTodayRecord",{session,recordId}));
