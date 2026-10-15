const args = process.argv.slice(2);
console.log(`noop${args.length > 0 ? `: ${args.join(' ')}` : ''}`);
