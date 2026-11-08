export async function localBank<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>,storeName='takes'):Promise<T>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open('evervoice-studio',3);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains('takes'))req.result.createObjectStore('takes',{keyPath:'id'});
      if(!req.result.objectStoreNames.contains('events'))req.result.createObjectStore('events',{keyPath:'id'});
      if(!req.result.objectStoreNames.contains('videos')){
        req.result.createObjectStore('videos',{keyPath:'id'}).createIndex('eventId','eventId');
      }
    };
    req.onsuccess=()=>{
      req.result.onversionchange=()=>req.result.close();
      resolve(req.result);
    };
    req.onerror=()=>reject(req.error);
  });
  try{return await new Promise<T>((resolve,reject)=>{
    const tx=db.transaction(storeName,mode), result=operation(tx.objectStore(storeName));
    tx.oncomplete=()=>resolve(result.result);
    tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
